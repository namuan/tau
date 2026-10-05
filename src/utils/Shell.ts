import { execFileSync, spawn } from 'child_process'
import { constants as fsConstants, readFileSync, unlinkSync } from 'fs'
import { type FileHandle, mkdir, open, realpath } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { isAbsolute, resolve } from 'path'
import { logEvent } from 'src/services/analytics/index.js'
import {
  clearSystemPromptSectionCacheEntry,
  getOriginalCwd,
  getSessionId,
  setCwdState,
} from '../bootstrap/state.js'
import { generateTaskId } from '../Task.js'
import { pwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { errorMessage, isENOENT } from './errors.js'
import { getFsImplementation } from './fsOperations.js'
import { logError } from './log.js'
import {
  createAbortedCommand,
  createFailedCommand,
  type ShellCommand,
  wrapSpawn,
} from './ShellCommand.js'
import { getTaskOutputDir } from './task/diskOutput.js'
import { TaskOutput } from './task/TaskOutput.js'
import { which } from './which.js'

export type { ExecResult } from './ShellCommand.js'

import { accessSync } from 'fs'
import { onCwdChangedForHooks } from './hooks/fileChangedWatcher.js'
import { invalidateSessionEnvCache } from './sessionEnvironment.js'
import { type AgentModelEnv, withAgentEnv } from './shell/agentEnv.js'
import { createBashShellProvider } from './shell/bashProvider.js'
import type { ShellProvider, ShellType } from './shell/shellProvider.js'
import { subprocessEnv } from './subprocessEnv.js'

const DEFAULT_TIMEOUT = 30 * 60 * 1000 // 30 minutes

export type ShellConfig = {
  provider: ShellProvider
}

function isExecutable(shellPath: string): boolean {
  try {
    accessSync(shellPath, fsConstants.X_OK)
    return true
  } catch (_err) {
    // Fallback for Nix and other environments where X_OK check might fail
    try {
      // Try to execute the shell with --version, which should exit quickly
      // Use execFileSync to avoid shell injection vulnerabilities
      execFileSync(shellPath, ['--version'], {
        timeout: 1000,
        stdio: 'ignore',
      })
      return true
    } catch {
      return false
    }
  }
}

/**
 * Determines the best available shell to use.
 *
 * Returns null when no POSIX shell is available.
 */
export async function findSuitableShell(): Promise<string | null> {
  // Check for explicit shell override first
  const shellOverride = process.env.CLAUDE_CODE_SHELL
  if (shellOverride) {
    // Validate it's a supported shell type
    const isSupported =
      shellOverride.includes('bash') || shellOverride.includes('zsh')
    if (isSupported && isExecutable(shellOverride)) {
      logForDebugging(`Using shell override: ${shellOverride}`)
      return shellOverride
    } else {
      // Note, if we ever want to add support for new shells here we'll need to update or Bash tool parsing to account for this
      logForDebugging(
        `CLAUDE_CODE_SHELL="${shellOverride}" is not a valid bash/zsh path, falling back to detection`,
      )
    }
  }

  // Check user's preferred shell from environment
  const env_shell = process.env.SHELL
  // Only consider SHELL if it's bash or zsh
  const isEnvShellSupported =
    env_shell && (env_shell.includes('bash') || env_shell.includes('zsh'))
  const preferBash = env_shell?.includes('bash')

  // Try to locate shells using which (uses Bun.which when available)
  const [zshPath, bashPath] = await Promise.all([which('zsh'), which('bash')])

  // Populate shell paths from which results and fallback locations
  const shellPaths = ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']

  // Order shells based on user preference
  const shellOrder = preferBash ? ['bash', 'zsh'] : ['zsh', 'bash']
  const supportedShells = shellOrder.flatMap(shell =>
    shellPaths.map(path => `${path}/${shell}`),
  )

  // Add discovered paths to the beginning of our search list
  // Put the user's preferred shell type first
  if (preferBash) {
    if (bashPath) supportedShells.unshift(bashPath)
    if (zshPath) supportedShells.push(zshPath)
  } else {
    if (zshPath) supportedShells.unshift(zshPath)
    if (bashPath) supportedShells.push(bashPath)
  }

  // Always prioritize SHELL env variable if it's a supported shell type
  if (isEnvShellSupported && isExecutable(env_shell)) {
    supportedShells.unshift(env_shell)
  }

  const shellPath = supportedShells.find(shell => shell && isExecutable(shell))

  if (!shellPath) {
    const errorMsg =
      'No suitable Bash or Zsh shell found. Ensure Bash or Zsh is installed and SHELL points to it.'
    logError(new Error(errorMsg))
    throw new Error(errorMsg)
  }

  return shellPath
}

async function getShellConfigImpl(): Promise<ShellConfig | null> {
  const binShell = await findSuitableShell()
  if (!binShell) return null
  const provider = await createBashShellProvider(binShell)
  return { provider }
}

// Memoize the entire shell config so it only happens once per session
export const getShellConfig = memoize(getShellConfigImpl)

/**
 * Resolves the Bash shell provider.
 */
async function resolveBashProvider(): Promise<ShellProvider> {
  const config = await getShellConfig()
  if (config) return config.provider
  throw new Error('No suitable shell found. Install Bash or Zsh and restart Tau.')
}

export type ExecOptions = {
  timeout?: number
  onProgress?: (
    lastLines: string,
    allLines: string,
    totalLines: number,
    totalBytes: number,
    isIncomplete: boolean,
  ) => void
  preventCwdChanges?: boolean
  shouldAutoBackground?: boolean
  /** When provided, stdout is piped (not sent to file) and this callback fires on each data chunk. */
  onStdout?: (data: string) => void
  /**
   * Optional working directory for this single invocation. Absolute or
   * relative to the session cwd. Does not update the session cwd — this
   * lets the model run a command elsewhere without persisting a `cd`.
   */
  workdir?: string
  /**
   * Provider, model and effort of the agent whose own tool call runs this
   * command (see shell/agentModelEnv.ts), exported as TAU_PROVIDER,
   * TAU_MODEL and TAU_EFFORT. When absent, those variables stay unset.
   */
  agentModelEnv?: AgentModelEnv
}

/**
 * Execute a shell command using the environment snapshot
 * Creates a new shell process for each command execution
 */
export async function exec(
  command: string,
  abortSignal: AbortSignal,
  shellType: ShellType,
  options?: ExecOptions,
): Promise<ShellCommand> {
  const {
    timeout,
    onProgress,
    preventCwdChanges: optPreventCwdChanges,
    shouldAutoBackground,
    onStdout,
    workdir,
    agentModelEnv,
  } = options ?? {}
  const commandTimeout = timeout || DEFAULT_TIMEOUT
  // When workdir is set, never update the session cwd: the override is
  // per-invocation, so the trailing `pwd -P` reflects the override, not the
  // user's working directory. Treating workdir as preventCwdChanges keeps
  // sequential calls deterministic.
  const preventCwdChanges = workdir ? true : optPreventCwdChanges

  const provider = await resolveBashProvider()

  const id = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0')

  const { commandString, cwdFilePath } = await provider.buildExecCommand(
    command,
    { id },
  )

  let cwd = pwd()

  // Recover if the current working directory no longer exists on disk.
  // This can happen when a command deletes its own CWD (e.g., temp dir cleanup).
  try {
    await realpath(cwd)
  } catch {
    const fallback = getOriginalCwd()
    logForDebugging(
      `Shell CWD "${cwd}" no longer exists, recovering to "${fallback}"`,
    )
    try {
      await realpath(fallback)
      setCwdState(fallback)
      cwd = fallback
    } catch {
      return createFailedCommand(
        `Working directory "${cwd}" no longer exists. Please restart Claude from an existing directory.`,
      )
    }
  }

  // Resolve optional per-invocation workdir override. Relative paths resolve
  // against the session cwd (already validated above). realpath canonicalizes
  // symlinks so spawn's cwd matches what `pwd -P` would emit, and surfaces a
  // clear error if the model passed a missing directory.
  if (workdir) {
    const resolvedWorkdir = isAbsolute(workdir) ? workdir : resolve(cwd, workdir)
    try {
      cwd = await realpath(resolvedWorkdir)
    } catch {
      return createFailedCommand(
        `workdir "${workdir}" does not exist (resolved to "${resolvedWorkdir}").`,
      )
    }
  }

  // If already aborted, don't spawn the process at all
  if (abortSignal.aborted) {
    return createAbortedCommand()
  }

  const binShell = provider.shellPath

  const spawnBinary = binShell
  const shellArgs = provider.getSpawnArgs(commandString)
  const envOverrides = await provider.getEnvironmentOverrides(command)

  // When onStdout is provided, use pipe mode: stdout flows through
  // StreamWrapper → TaskOutput in-memory buffer instead of a file fd.
  // This lets callers receive real-time stdout callbacks.
  const usePipeMode = !!onStdout
  const taskId = generateTaskId('local_bash')
  const taskOutput = new TaskOutput(taskId, onProgress ?? null, !usePipeMode)
  await mkdir(getTaskOutputDir(), { recursive: true })

  // In file mode, both stdout and stderr go to the same file fd.
  // On POSIX, O_APPEND makes each write atomic (seek-to-end + write), so
  // stdout and stderr are interleaved chronologically without tearing.
  // SECURITY: O_NOFOLLOW prevents symlink-following attacks.
  let outputHandle: FileHandle | undefined
  if (!usePipeMode) {
    const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
    outputHandle = await open(
      taskOutput.path,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_APPEND |
        O_NOFOLLOW,
    )
  }
  const baseEnv = subprocessEnv()

  try {
    const childProcess = spawn(spawnBinary, shellArgs, {
      // withAgentEnv adds AI_AGENT and TAU_SESSION_ID (plus TAU_PROVIDER,
      // TAU_MODEL and TAU_EFFORT for a model's own tool call) and drops
      // inherited copies, such as a parent Tau's.
      env: withAgentEnv({
        ...baseEnv,
        PYTHONIOENCODING: baseEnv.PYTHONIOENCODING || 'utf-8',
        // Unbuffered Python stdio so output isn't lost when the process is
        // killed (timeout) or crashes before a buffered flush — bytes are
        // written incrementally instead of sitting in a block buffer.
        PYTHONUNBUFFERED: baseEnv.PYTHONUNBUFFERED || '1',
        SHELL: shellType === 'bash' ? binShell : undefined,
        GIT_EDITOR: 'true',
        CLAUDECODE: '1',
        ...envOverrides,
        ...(process.env.USER_TYPE === 'ant'
          ? {
              CLAUDE_CODE_SESSION_ID: getSessionId(),
            }
          : {}),
      }, { sessionId: getSessionId(), agentModel: agentModelEnv }),
      cwd,
      stdio: usePipeMode
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', outputHandle?.fd, outputHandle?.fd],
      // Don't pass the signal - we'll handle termination ourselves with tree-kill
      detached: provider.detached,
    })

    const shellCommand = wrapSpawn(
      childProcess,
      abortSignal,
      commandTimeout,
      taskOutput,
      shouldAutoBackground,
    )

    // Close our copy of the fd — the child has its own dup.
    // Must happen after wrapSpawn attaches 'error' listener, since the await
    // yields and the child's ENOENT 'error' event can fire in that window.
    // Wrapped in its own try/catch so a close failure (e.g. EIO) doesn't fall
    // through to the spawn-failure catch block, which would orphan the child.
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // fd may already be closed by the child; safe to ignore
      }
    }

    // In pipe mode, attach the caller's callbacks alongside StreamWrapper.
    // Both listeners receive the same data chunks (Node.js ReadableStream supports
    // multiple 'data' listeners). StreamWrapper feeds TaskOutput for persistence;
    // these callbacks give the caller real-time access.
    if (childProcess.stdout && onStdout) {
      childProcess.stdout.on('data', (chunk: string | Buffer) => {
        onStdout(typeof chunk === 'string' ? chunk : chunk.toString())
      })
    }

    // Attach cleanup to the command result
    // NOTE: readFileSync/unlinkSync are intentional here — these must complete
    // synchronously within the .then() microtask so that callers who
    // `await shellCommand.result` see the updated cwd immediately after.
    // Using async readFile would introduce a microtask boundary, causing
    // a race where cwd hasn't been updated yet when the caller continues.

    const nativeCwdFilePath = cwdFilePath

    void shellCommand.result.then(async result => {
      // Only foreground tasks update the cwd
      if (result && !preventCwdChanges && !result.backgroundTaskId) {
        try {
          let newCwd = readFileSync(nativeCwdFilePath, {
            encoding: 'utf8',
          }).trim()
          // cwd is NFC-normalized (setCwdState); newCwd from `pwd -P` may be
          // NFD on macOS APFS. Normalize before comparing so Unicode paths
          // don't false-positive as "changed" on every command.
          if (newCwd.normalize('NFC') !== cwd) {
            setCwd(newCwd, cwd)
            invalidateSessionEnvCache()
            clearSystemPromptSectionCacheEntry('env_info_simple')
            void onCwdChangedForHooks(cwd, newCwd)
          }
        } catch {
          logEvent('tengu_shell_set_cwd', { success: false })
        }
      }
      // Clean up the temp file used for cwd tracking
      try {
        unlinkSync(nativeCwdFilePath)
      } catch {
        // File may not exist if command failed before pwd -P ran
      }
    })

    return shellCommand
  } catch (error) {
    // Close the fd if spawn failed (child never got its dup)
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // May already be closed
      }
    }
    taskOutput.clear()

    logForDebugging(`Shell exec error: ${errorMessage(error)}`)

    return createAbortedCommand(undefined, {
      code: 126, // Standard Unix code for execution errors
      stderr: errorMessage(error),
    })
  }
}

/**
 * Set the current working directory
 */
export function setCwd(path: string, relativeTo?: string): void {
  const resolved = isAbsolute(path)
    ? path
    : resolve(relativeTo || getFsImplementation().cwd(), path)
  // Resolve symlinks to match the behavior of pwd -P.
  // realpathSync throws ENOENT if the path doesn't exist - convert to a
  // friendlier error message instead of a separate existsSync pre-check (TOCTOU).
  let physicalPath: string
  try {
    physicalPath = getFsImplementation().realpathSync(resolved)
  } catch (e) {
    if (isENOENT(e)) {
      throw new Error(`Path "${resolved}" does not exist`)
    }
    throw e
  }

  setCwdState(physicalPath)
  if (process.env.NODE_ENV !== 'test') {
    try {
      logEvent('tengu_shell_set_cwd', {
        success: true,
      })
    } catch (_error) {
      // Ignore logging errors to prevent test failures
    }
  }
}
