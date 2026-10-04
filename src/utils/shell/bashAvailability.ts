import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { findGitBashPath } from '../windowsPaths.js'

export type BashSource =
  | 'system' // Linux/macOS /usr/bin/bash, etc.
  | 'homebrew' // /opt/homebrew/bin/bash or /usr/local/bin/bash from brew
  | 'git-for-windows' // bash.exe shipped with Git for Windows
  | 'wsl' // bash routed through wsl.exe
  | null

export type BashStatus = {
  ok: boolean
  /** Resolved bash executable path, or null when no bash is reachable. */
  path: string | null
  /** Full first-line of `bash --version`, or null. */
  versionLine: string | null
  source: BashSource
}

const NULL_STATUS: BashStatus = {
  ok: false,
  path: null,
  versionLine: null,
  source: null,
}

/** Cached result — bash availability is stable for the life of a process. */
let cached: BashStatus | null = null

export function detectBash(): BashStatus {
  if (cached) return cached
  cached = computeStatus()
  return cached
}

/** For tests / post-install verification — drop the cache. */
export function resetBashAvailabilityCache(): void {
  cached = null
}

function computeStatus(): BashStatus {
  if (process.platform === 'win32') {
    return detectWindowsBash()
  }
  return detectUnixBash()
}

function detectUnixBash(): BashStatus {
  // Prefer Homebrew Bash on macOS, then fall back to the system Bash.
  if (process.platform === 'darwin') {
    for (const brewPath of ['/opt/homebrew/bin/bash', '/usr/local/bin/bash']) {
      if (existsSync(brewPath)) {
        const probe = probeBash(brewPath)
        if (probe) return { ...probe, source: 'homebrew' }
      }
    }
    if (existsSync('/bin/bash')) {
      const probe = probeBash('/bin/bash')
      if (probe) {
        return { ...probe, source: 'system' }
      }
    }
  }

  // Linux / fallback — trust PATH.
  const probe = probeBash('bash')
  if (probe) return { ...probe, source: 'system' }
  return NULL_STATUS
}

function detectWindowsBash(): BashStatus {
  const gitBash = findGitBashPath()
  if (gitBash) {
    const probe = probeBash(gitBash)
    if (probe) return { ...probe, source: 'git-for-windows' }
  }

  // On Windows Tau uses Git Bash for native shell commands. WSL is detected
  // so the setup dialog can explain why Git Bash is required.
  if (existsSync('C:\\Windows\\System32\\wsl.exe')) {
    const out = spawnSync(
      'C:\\Windows\\System32\\wsl.exe',
      ['bash', '--version'],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 },
    )
    if (out.status === 0) {
      const versionLine = (out.stdout?.toString() ?? '').split('\n')[0]?.trim() || null
      return {
        ok: true,
        path: 'wsl.exe',
        versionLine,
        source: 'wsl',
      }
    }
  }

  return NULL_STATUS
}

function probeBash(executable: string): BashStatus | null {
  const out = spawnSync(executable, ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
    windowsHide: true,
  })
  if (out.status !== 0) return null
  const versionLine = (out.stdout?.toString() ?? '').split('\n')[0]?.trim() || null
  return {
    ok: true,
    path: executable,
    versionLine,
    source: 'system',
  }
}
