import { getSettingsForSource } from './settings.js'
import type { CUSTOMIZATION_SURFACES } from './types.js'

export type CustomizationSurface = (typeof CUSTOMIZATION_SURFACES)[number]

/**
 * Check whether a customization surface is restricted by the legacy managed
 * `strictPluginOnlyCustomization` policy.
 *
 * Restricted user-level and project-level sources are skipped. Managed and
 * built-in sources remain available. The setting is retained for backward
 * compatibility and preserves its fail-closed behavior.
 *
 * `true` locks all four surfaces; array form locks only those listed.
 * Absent/undefined → nothing locked (the default).
 */
export function isRestrictedToPluginOnly(
  surface: CustomizationSurface,
): boolean {
  const policy =
    getSettingsForSource('policySettings')?.strictPluginOnlyCustomization
  if (policy === true) return true
  if (Array.isArray(policy)) return policy.includes(surface)
  return false
}

/**
 * Sources that bypass strictPluginOnlyCustomization. Admin-trusted because:
 *   policySettings — from managed settings, admin-controlled by definition
 *   built-in / builtin / bundled — ship with the CLI, not user-authored
 *
 * Everything else (userSettings, projectSettings, localSettings, flagSettings,
 * mcp, undefined) is user-controlled and blocked when the relevant surface
 * is locked. Covers both AgentDefinition.source ('built-in' with hyphen) and
 * Command.source ('builtin' no hyphen, plus 'bundled').
 */
const ADMIN_TRUSTED_SOURCES: ReadonlySet<string> = new Set([
  'plugin',
  'policySettings',
  'built-in',
  'builtin',
  'bundled',
])

/**
 * Whether a customization's source is admin-trusted under
 * strictPluginOnlyCustomization. Use this to gate frontmatter-hook
 * registration and similar per-item checks where the item carries a
 * source tag but the surface's filesystem loader already ran.
 *
 * Pattern at call sites:
 *   const allowed = !isRestrictedToPluginOnly(surface) || isSourceAdminTrusted(item.source)
 *   if (item.hooks && allowed) { register(...) }
 */
export function isSourceAdminTrusted(source: string | undefined): boolean {
  return source !== undefined && ADMIN_TRUSTED_SOURCES.has(source)
}
