import { spawnSync, type SpawnSyncReturns } from 'child_process'
import { existsSync } from 'fs'
import {
  detectBash,
  resetBashAvailabilityCache,
} from './bashAvailability.js'

export type InstallResult = {
  ok: boolean
  message: string
  command: string | null
}

export type InstallPlan = {
  canInstall: boolean
  label: string
  command: string
  executable?: string
  args?: string[]
  manualUrl?: string
  manualNote?: string
}

export function planBashInstall(): InstallPlan {
  if (process.platform !== 'darwin') {
    return {
      canInstall: false,
      label: 'unsupported platform',
      command: '',
      manualNote: 'Tau is supported only on macOS.',
    }
  }

  const brew = resolveBrew()
  if (!brew) {
    return {
      canInstall: false,
      label: 'manual',
      command: '',
      manualUrl: 'https://brew.sh',
      manualNote: 'Bash was not found. Install Bash with Homebrew or another package manager, then re-run Tau.',
    }
  }

  return {
    canInstall: true,
    label: 'Homebrew',
    command: `${brew} install bash`,
    executable: brew,
    args: ['install', 'bash'],
  }
}

export function runBashInstall(plan: InstallPlan): InstallResult {
  if (!plan.canInstall || !plan.executable) {
    return {
      ok: false,
      message: plan.manualNote ?? 'No automatic install available.',
      command: null,
    }
  }

  let result: SpawnSyncReturns<Buffer>
  try {
    result = spawnSync(plan.executable, plan.args ?? [], { stdio: 'inherit' })
  } catch (err) {
    return {
      ok: false,
      message: `Failed to spawn ${plan.executable}: ${(err as Error).message}`,
      command: plan.command,
    }
  }

  resetBashAvailabilityCache()
  if (result.status === 0) {
    const status = detectBash()
    if (status.ok) {
      return {
        ok: true,
        message: `Installed Bash via ${plan.label}.`,
        command: plan.command,
      }
    }
    return {
      ok: false,
      message:
        `Command completed, but Tau still cannot find Bash. ` +
        `Detected: ${status.versionLine ?? 'none'}. You can run \`${plan.command}\` manually to retry.`,
      command: plan.command,
    }
  }

  return {
    ok: false,
    message: `Install failed (${plan.label}, exit ${result.status}). You can run \`${plan.command}\` manually to retry.`,
    command: plan.command,
  }
}

function resolveBrew(): string | null {
  for (const candidate of ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']) {
    if (existsSync(candidate)) return candidate
  }
  const probe = spawnSync('brew', ['--version'], {
    stdio: 'ignore',
    timeout: 5000,
  })
  return probe.status === 0 ? 'brew' : null
}
