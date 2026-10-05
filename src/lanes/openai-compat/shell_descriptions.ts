/**
 * Compact, example-driven shell-tool descriptions for the OpenAI-compat
 * lane.
 *
 * The frontier-tier Bash description is a long-form rule list. It works for
 * Claude / Codex / Gemini-2.5 / GPT-5, but weak models on the compat lane
 * (DeepSeek, GLM, Moonshot, MiniMax, Groq, OpenRouter long-tail, Ollama, LM
 * Studio) drown in the volume and emit wrong-shell syntax, miss quotes around
 * paths with spaces, and rely on cwd-changing prefixes instead of absolute
 * paths or native location flags.
 *
 * This module emits a compact description with concrete good/bad pairs. The
 * mental model is: a small model can imitate patterns much better than it can
 * derive correct syntax from rules.
 *
 * Cache-stability invariant: the output must be deterministic. Do not include
 * homedir / tmpdir / session id / timestamps — the compat lane caches tool
 * descriptions per session and any per-call data would churn the upstream
 * prompt-cache prefix every turn.
 */

export interface CompatShellDescriptionCtx {
  platform: NodeJS.Platform
}

/**
 * Returns a compact description for the named shell tool, or undefined
 * when the tool isn't a known shell tool (caller falls back to the tool's
 * original description).
 */
export function getCompatShellDescription(
  toolName: string,
  _ctx?: CompatShellDescriptionCtx,
): string | undefined {
  if (toolName !== 'Bash') return undefined

  return [
    'Run a bash command and return its output. Use this for git, npm, build/test runners, package managers, and any other terminal-driven workflow.',
    '',
    'DO NOT use this for file ops — call the dedicated tools:',
    '- Read files → Read tool (NOT `cat` / `head` / `tail`).',
    '- Search filenames → Glob tool (NOT `find` / `ls -R`).',
    '- Search file contents → Grep tool (NOT `grep` / `rg`).',
    '- Edit files → Edit / Write tools (NOT `sed` / `awk` / `echo >`).',
    '',
    'Required: `command`. Optional: `description` (one short active-voice phrase), `timeout` (milliseconds), `run_in_background` (boolean).',
    'For long-running servers, watchers, port-forwards, tunnels, or foreground container runs, set `run_in_background: true`. Do NOT put `&`, `nohup`, `disown`, `echo $!`, `docker compose up -d`, or `docker run -d` in `command`; keep log redirection if needed and let the tool track/stop the process.',
    'Examples: Good command `uvicorn app:app --host 0.0.0.0 > "$TMPDIR/app.log" 2>&1` or `docker compose up` with `run_in_background: true`; bad command `npm run dev > /tmp/app.log 2>&1 & echo $!`.',
    'When targeting another directory, put the absolute path in the command or use the CLI native location flag. Trust `[Ran in /path …]` notes over memory of earlier directory changes.',
    '',
    'Examples — good vs bad:',
    '- Good: `git -C /repo status` · Bad: `cd /repo && git status`.',
    '- Good: `npm --prefix /repo/app run build` · Good: `docker compose -f /repo/compose.yaml up -d`.',
    '- Good: `cat "path with spaces/file.txt"` · Bad: `cat path with spaces/file.txt` (the unquoted path is parsed as four args).',
    '- Good: `git add . && git commit -m "fix"` · Bad: `git add .\\ngit commit -m "fix"` (do not use newlines to separate commands; use `&&` to chain).',
    '- Good: `git commit -m "$(cat <<\'EOF\'\nMultiline\nmessage\nEOF\n)"` · Bad: passing a multi-line message via interpolated double-quoted string (variables and backticks expand).',
    '',
    'Chaining: `&&` runs the next command only if the previous one succeeded; `;` runs it regardless. Independent commands belong in parallel tool calls in the SAME assistant message, not chained.',
    '',
    'When a command fails, read the exit code and stderr before retrying. Don\'t iterate on cosmetic variants of the same call — diagnose first. After two same-cause failures stop and investigate.',
    '',
    'Use POSIX paths; backslashes are escapes in Bash.',
  ].join('\n')
}
