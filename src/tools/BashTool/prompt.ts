import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { getPlatform } from '../../utils/platform.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import {
  getBashCommandBestPractices,
  getBashPlatformBestPractices,
} from './bashBestPractices.js'
import { BASH_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return 'For servers, watchers, tunnels, port-forwards, and other long-lived foreground work, set `run_in_background: true`. Do not detach inside `command` with `&`, `nohup`, `disown`, `echo $!`, `docker compose up -d`, or `docker run -d`; Tau tracks the task and reports completion.'
}

function getGitInstructions(): string {
  // Defense-in-depth: undercover instructions must survive even if the user
  // has disabled git instructions entirely. Attribution stripping and model-ID
  // hiding are mechanical and work regardless, but the explicit "don't blow
  // your cover" instructions are the last line of defense against the model
  // volunteering an internal codename in a commit message.
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // For ant users, use the short version pointing to skills
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `For git commits, use the \`/commit\` skill to create a commit with staged changes. It follows git safety protocols and formats the commit message.

`
      : ''
    return `${undercoverSection}# Git

${skillsSection}IMPORTANT: NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it.`
  }

  // Keep the model-visible contract compact. Permission checks, destructive
  // command checks, hook failures, and command diagnostics are enforced by the
  // execution path and return actionable errors at the point of use.
  const { commit: commitAttribution } = getAttributionTexts()

  return `# Git

- Commit or push only when requested. Never change git config, skip hooks/signing, force-push main/master, or use destructive git commands without explicit authorization.
- Before committing, inspect status, staged/unstaged diff, and recent log; stage named files, exclude secrets, and do not create empty commits. Prefer a new commit. If a hook fails, fix it and create a new commit rather than amending.${commitAttribution ? ` End the commit message with:\n${commitAttribution}` : ''}
- Push only when requested.`
}


export function getSimplePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep in Claude's shell,
  // so we don't steer away from them (and Glob/Grep tools are removed).
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `File search: Use ${GLOB_TOOL_NAME} (NOT find or ls)`,
          `Content search: Use ${GREP_TOOL_NAME} (NOT grep or rg)`,
        ]),
    `Read files: Use ${FILE_READ_TOOL_NAME} (NOT cat/head/tail)`,
    `Edit files: Use ${FILE_EDIT_TOOL_NAME} (NOT sed/awk)`,
    `Write files: Use ${FILE_WRITE_TOOL_NAME} (NOT echo >/cat <<EOF)`,
    'Communication: Output text directly (NOT echo/printf)',
  ]

  const avoidCommands = embedded
    ? '`cat`, `head`, `tail`, `sed`, `awk`, or `echo`'
    : '`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`'

  const multipleCommandsSubitems = [
    `Send independent commands as parallel ${BASH_TOOL_NAME} calls; join dependent commands with \`&&\`. Use \`;\` only when later commands should run after a failure.`,
    'Do not use unquoted newlines as command separators.',
  ]

  const gitSubitems = [
    'Prefer new commits. Use destructive operations, amend, force-push, or hook/signing bypasses only when explicitly requested.',
    'If a hook fails, fix the cause and retry as a new commit.',
  ]

  const sleepSubitems = [
    'Do not sleep, poll, or retry in a loop when work can run immediately; diagnose failures.',
    'For long-running work use `run_in_background`; Tau reports completion, so do not poll.',
    'For an external process, run its status command directly. If a deliberate delay is unavoidable, keep it short.',
  ]
  const backgroundNote = getBackgroundUsageNote()
  const platform = getPlatform()
  const platformBestPractices = getBashPlatformBestPractices(platform)
  const commandBestPractices = getBashCommandBestPractices()

  const instructionItems: Array<string | string[]> = [
    'Target the exact directory the user named. Put its absolute path in the command, pass it as an argument, or use the CLI\'s native location flag (for example `git -C`, `npm --prefix`, or `docker compose -f`). Do not run a bare project command in another cwd.',
    'Before creating files or running project-specific build/test/package commands, verify the target directory and relevant manifest exist. Never guess paths.',
    'Quote paths containing spaces and shell expansions unless splitting/globbing is intended.',
    'Run normal Bash commands directly. Use `plan_only: true` only when the user explicitly asks for a dry-run plan; do not use it as a routine preflight for Python, package-manager, build, test, or cleanup commands.',
    'Use `$TMPDIR` for temporary files instead of assuming a fixed temporary directory.',
    `\`timeout\` is milliseconds; default ${getDefaultTimeoutMs()}, maximum ${getMaxTimeoutMs()}.`,
    'To show the user a chart, plot, or rendered image, print a single `data:image/png;base64,...` URI as the entire stdout — Tau renders it inline in the terminal and sends it to you as an image. Prefer this over ASCII-art plotting libraries such as plotext. For matplotlib, use the Agg backend and savefig to an in-memory buffer.',
    ...(backgroundNote !== null ? [backgroundNote] : []),
    'Shell correctness rules:',
    commandBestPractices,
    'Platform-specific shell rules:',
    platformBestPractices,
    'When issuing multiple commands:',
    multipleCommandsSubitems,
    'For git commands:',
    gitSubitems,
    'Avoid unnecessary `sleep` commands:',
    sleepSubitems,
    ...(embedded
      ? [
          // bfs (which backs `find`) uses Oniguruma for -regex, which picks the
          // FIRST matching alternative (leftmost-first), unlike GNU find's
          // POSIX leftmost-longest. This silently drops matches when a shorter
          // alternative is a prefix of a longer one.
          "When using `find -regex` with alternation, put the longest alternative first. Example: use `'.*\\.\\(tsx\\|ts\\)'` not `'.*\\.\\(ts\\|tsx\\)'` — the second form silently skips `.tsx` files.",
        ]
      : []),
  ]

  return [
    'Executes a given bash command and returns its output.',
    '',
    "The working directory persists between commands, but shell state does not. The shell environment is initialized from the user's profile (bash or zsh).",
    '',
    'A bracketed directory note in a result is authoritative. Shell state does not persist; target other directories with absolute paths or native location flags.',
    '',
    `Prefer dedicated tools over ${avoidCommands}:`,
    '',
    ...prependBullets(toolPreferenceItems),
    '',
    '# Instructions',
    ...prependBullets(instructionItems),
    ...(getGitInstructions() ? ['', getGitInstructions()] : []),
  ].join('\n')
}
