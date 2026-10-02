import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

export function toCompatSessionId(id: string): string {
  if (!id.startsWith('cse_')) return id
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_bridge_repl_v2_cse_shim_enabled',
      true,
    )
  ) {
    return id
  }
  return 'session_' + id.slice('cse_'.length)
}
