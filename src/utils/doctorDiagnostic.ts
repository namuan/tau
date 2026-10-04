import { execa } from 'execa'
import { readFile, realpath } from 'fs/promises'
import { join } from 'path'
import { checkGlobalInstallPermissions } from './autoUpdater.js'
import { isInBundledMode } from './bundledMode.js'
import {
  formatAutoUpdaterDisabledReason,
  getAutoUpdaterDisabledReason,
  getGlobalConfig,
  type InstallMethod,
} from './config.js'
import { getCwd } from './cwd.js'
import { getInstallHealthWarning } from './installHealth.js'
import { isRunningFromLocalInstallation, localInstallationExists } from './localInstaller.js'
import { detectApk, detectAsdf, detectDeb, detectHomebrew, detectMise, detectPacman, detectRpm, detectWinget, getPackageManager } from './nativeInstaller/packageManagers.js'
import { getPlatform } from './platform.js'
import { getRipgrepStatus } from './ripgrep.js'
import { SandboxManager } from './sandbox/sandbox-adapter.js'
import { getManagedFilePath } from './settings/managedPath.js'
import { CUSTOMIZATION_SURFACES } from './settings/types.js'
import { jsonParse } from './slowOperations.js'

export type InstallationType =
  | 'npm-global'
  | 'npm-local'
  | 'native'
  | 'package-manager'
  | 'development'
  | 'unknown'

export type DiagnosticInfo = {
  installationType: InstallationType
  version: string
  installationPath: string
  invokedBinary: string
  configInstallMethod: InstallMethod | 'not set'
  autoUpdates: string
  hasUpdatePermissions: boolean | null
  multipleInstallations: Array<{ type: string; path: string }>
  warnings: Array<{ issue: string; fix: string }>
  recommendation?: string
  packageManager?: string
  ripgrepStatus: {
    working: boolean
    mode: 'system' | 'builtin' | 'embedded'
    systemPath: string | null
  }
}

export async function getCurrentInstallationType(): Promise<InstallationType> {
  if (process.env.NODE_ENV === 'development') return 'development'

  const invokedPath = process.argv[1] || ''
  if (isInBundledMode()) {
    if (
      detectHomebrew() ||
      detectWinget() ||
      detectMise() ||
      detectAsdf() ||
      (await detectPacman()) ||
      (await detectDeb()) ||
      (await detectRpm()) ||
      (await detectApk())
    ) {
      return 'package-manager'
    }
    return 'native'
  }

  if (isRunningFromLocalInstallation()) return 'npm-local'

  const npmGlobalPaths = [
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/.nvm/versions/node/',
  ]
  if (
    npmGlobalPaths.some(path => invokedPath.includes(path)) ||
    invokedPath.includes('/npm/') ||
    invokedPath.includes('/nvm/')
  ) {
    return 'npm-global'
  }

  const npmConfigResult = await execa('npm config get prefix', {
    shell: true,
    reject: false,
  })
  const globalPrefix =
    npmConfigResult.exitCode === 0 ? npmConfigResult.stdout.trim() : null

  if (globalPrefix && invokedPath.startsWith(globalPrefix)) return 'npm-global'
  return 'unknown'
}

async function getInstallationPath(): Promise<string> {
  if (process.env.NODE_ENV === 'development') return getCwd()

  if (isInBundledMode()) {
    try {
      return await realpath(process.execPath)
    } catch {
      return process.execPath || 'unknown'
    }
  }

  return process.argv[1] || 'unknown'
}

export function getInvokedBinary(): string {
  return isInBundledMode()
    ? process.execPath || 'unknown'
    : process.argv[1] || 'unknown'
}

async function detectConfigurationIssues(
  type: InstallationType,
): Promise<Array<{ issue: string; fix: string }>> {
  const warnings: Array<{ issue: string; fix: string }> = []

  try {
    const raw = await readFile(
      join(getManagedFilePath(), 'managed-settings.json'),
      'utf-8',
    )
    const parsed: unknown = jsonParse(raw)
    const field =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).strictPluginOnlyCustomization
        : undefined
    if (field !== undefined && typeof field !== 'boolean') {
      if (!Array.isArray(field)) {
        warnings.push({
          issue: `managed-settings.json: strictPluginOnlyCustomization has an invalid value (expected true or an array, got ${typeof field})`,
          fix: `Set it to true, or an array of: ${CUSTOMIZATION_SURFACES.join(', ')}.`,
        })
      } else {
        const unknown = field.filter(
          value =>
            typeof value === 'string' &&
            !(CUSTOMIZATION_SURFACES as readonly string[]).includes(value),
        )
        if (unknown.length > 0) {
          warnings.push({
            issue: `managed-settings.json: strictPluginOnlyCustomization has ${unknown.length} value(s) this client doesn't recognize: ${unknown.map(String).join(', ')}`,
            fix: `Known surfaces for this version: ${CUSTOMIZATION_SURFACES.join(', ')}.`,
          })
        }
      }
    }
  } catch {}

  if (type === 'development') return warnings

  const installHealthWarning = getInstallHealthWarning()
  if (installHealthWarning) warnings.push(installHealthWarning)

  const config = getGlobalConfig()
  if (
    type === 'npm-local' &&
    config.installMethod &&
    config.installMethod !== 'local'
  ) {
    warnings.push({
      issue: `Running from a local Tau installation but config install method is '${config.installMethod}'`,
      fix: 'Run tau update to update this installation.',
    })
  }

  if (type === 'npm-global' && (await localInstallationExists())) {
    warnings.push({
      issue: 'A managed local Tau installation exists but is not being used',
      fix: 'Run tau update to update the currently active installation.',
    })
  }

  return warnings
}

export function detectLinuxGlobPatternWarnings(): Array<{
  issue: string
  fix: string
}> {
  if (getPlatform() !== 'linux') return []

  const warnings: Array<{ issue: string; fix: string }> = []
  const globPatterns = SandboxManager.getLinuxGlobPatternWarnings()
  if (globPatterns.length > 0) {
    const displayPatterns = globPatterns.slice(0, 3).join(', ')
    const remaining = globPatterns.length - 3
    const patternList =
      remaining > 0 ? `${displayPatterns} (${remaining} more)` : displayPatterns
    warnings.push({
      issue: 'Glob patterns in sandbox permission rules are not fully supported on Linux',
      fix: `Found ${globPatterns.length} pattern(s): ${patternList}. On Linux, glob patterns in Edit/Read rules will be ignored.`,
    })
  }

  return warnings
}

export async function getDoctorDiagnostic(): Promise<DiagnosticInfo> {
  const installationType = await getCurrentInstallationType()
  const version =
    typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown'
  const installationPath = await getInstallationPath()
  const invokedBinary = getInvokedBinary()
  const warnings = await detectConfigurationIssues(installationType)
  warnings.push(...detectLinuxGlobPatternWarnings())

  let hasUpdatePermissions: boolean | null = null
  if (installationType === 'npm-global') {
    const permissionCheck = await checkGlobalInstallPermissions()
    hasUpdatePermissions = permissionCheck.hasPermissions
    if (!hasUpdatePermissions && !getAutoUpdaterDisabledReason()) {
      warnings.push({
        issue: 'Insufficient permissions for auto-updates',
        fix: 'Repair npm global-prefix permissions, then run tau update.',
      })
    }
  }

  const ripgrepStatusRaw = getRipgrepStatus()
  const config = getGlobalConfig()
  const packageManager =
    installationType === 'package-manager'
      ? await getPackageManager()
      : undefined

  return {
    installationType,
    version,
    installationPath,
    invokedBinary,
    configInstallMethod: config.installMethod || 'not set',
    autoUpdates: (() => {
      const reason = getAutoUpdaterDisabledReason()
      return reason
        ? `disabled (${formatAutoUpdaterDisabledReason(reason)})`
        : 'enabled'
    })(),
    hasUpdatePermissions,
    multipleInstallations: [],
    warnings,
    packageManager,
    ripgrepStatus: {
      working: ripgrepStatusRaw.working ?? true,
      mode: ripgrepStatusRaw.mode,
      systemPath:
        ripgrepStatusRaw.mode === 'system' ? ripgrepStatusRaw.path : null,
    },
  }
}
