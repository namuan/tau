import { readFile } from 'fs/promises'
import { join } from 'path'
import { isInBundledMode } from './bundledMode.js'
import { getCwd } from './cwd.js'
import { getPlatform } from './platform.js'
import { getRipgrepStatus } from './ripgrep.js'
import { SandboxManager } from './sandbox/sandbox-adapter.js'
import { getManagedFilePath } from './settings/managedPath.js'
import { CUSTOMIZATION_SURFACES } from './settings/types.js'
import { jsonParse } from './slowOperations.js'

export type InstallationType = 'local-checkout' | 'bundled' | 'development'

export type DiagnosticInfo = {
  installationType: InstallationType
  version: string
  installationPath: string
  invokedBinary: string
  warnings: Array<{ issue: string; fix: string }>
  ripgrepStatus: {
    working: boolean
    mode: 'system' | 'builtin' | 'embedded'
    systemPath: string | null
  }
}

async function detectConfigurationIssues(): Promise<Array<{ issue: string; fix: string }>> {
  const warnings: Array<{ issue: string; fix: string }> = []

  try {
    const raw = await readFile(join(getManagedFilePath(), 'managed-settings.json'), 'utf-8')
    const parsed: unknown = jsonParse(raw)
    const field = parsed && typeof parsed === 'object'
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
          value => typeof value === 'string' && !(CUSTOMIZATION_SURFACES as readonly string[]).includes(value),
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

  return warnings
}

export function detectLinuxGlobPatternWarnings(): Array<{ issue: string; fix: string }> {
  if (getPlatform() !== 'linux') return []

  const globPatterns = SandboxManager.getLinuxGlobPatternWarnings()
  if (globPatterns.length === 0) return []
  const displayPatterns = globPatterns.slice(0, 3).join(', ')
  const remaining = globPatterns.length - 3
  const patternList = remaining > 0 ? `${displayPatterns} (${remaining} more)` : displayPatterns
  return [{
    issue: 'Glob patterns in sandbox permission rules are not fully supported on Linux',
    fix: `Found ${globPatterns.length} pattern(s): ${patternList}. On Linux, glob patterns in Edit/Read rules will be ignored.`,
  }]
}

export async function getDoctorDiagnostic(): Promise<DiagnosticInfo> {
  const installationType = process.env.NODE_ENV === 'development'
    ? 'development'
    : isInBundledMode()
      ? 'bundled'
      : 'local-checkout'
  const ripgrepStatus = getRipgrepStatus()
  const warnings = await detectConfigurationIssues()
  warnings.push(...detectLinuxGlobPatternWarnings())

  return {
    installationType,
    version: typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown',
    installationPath: getCwd(),
    invokedBinary: isInBundledMode() ? process.execPath || 'unknown' : process.argv[1] || 'unknown',
    warnings,
    ripgrepStatus: {
      working: ripgrepStatus.working ?? true,
      mode: ripgrepStatus.mode,
      systemPath: ripgrepStatus.mode === 'system' ? ripgrepStatus.path : null,
    },
  }
}
