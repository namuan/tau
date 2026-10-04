import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

export type BashSource = 'system' | 'homebrew' | null

export type BashStatus = {
  ok: boolean
  path: string | null
  versionLine: string | null
  source: BashSource
}

const NULL_STATUS: BashStatus = {
  ok: false,
  path: null,
  versionLine: null,
  source: null,
}

let cached: BashStatus | null = null

export function detectBash(): BashStatus {
  if (cached) return cached
  cached = computeStatus()
  return cached
}

export function resetBashAvailabilityCache(): void {
  cached = null
}

function computeStatus(): BashStatus {
  if (process.platform !== 'darwin') return NULL_STATUS

  for (const candidate of [
    ['/opt/homebrew/bin/bash', 'homebrew'],
    ['/usr/local/bin/bash', 'homebrew'],
    ['/bin/bash', 'system'],
  ] as const) {
    const [path, source] = candidate
    if (!existsSync(path)) continue
    const probe = probeBash(path)
    if (probe) return { ...probe, source }
  }

  const probe = probeBash('bash')
  return probe ? { ...probe, source: 'system' } : NULL_STATUS
}

function probeBash(executable: string): BashStatus | null {
  const out = spawnSync(executable, ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  })
  if (out.status !== 0) return null
  const versionLine = (out.stdout?.toString() ?? '').split('\n')[0]?.trim() || null
  return {
    ok: true,
    path: executable,
    versionLine,
    source: null,
  }
}
