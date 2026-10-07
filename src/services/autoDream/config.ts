// Leaf config module — intentionally minimal imports so UI components
// can read the auto-dream enabled state without dragging in the forked
// agent / task registry / message builder chain that autoDream.ts pulls in.

import { getInitialSettings } from '../../utils/settings/settings.js'


/**
 * Whether background memory consolidation should run. User setting
 * (autoDreamEnabled in settings.json) overrides the GrowthBook default
 * when explicitly set; otherwise falls through to tengu_onyx_plover.
 */
export function isAutoDreamEnabled(): boolean {
  const settings = getInitialSettings()
  // Explicit autoDreamEnabled always wins. Note: self-learning's switch does
  // NOT auto-enable the background dream — self-learning is interactive (no
  // silent memory writes); enable autoDream separately if you want it.
  if (settings.autoDreamEnabled !== undefined) return settings.autoDreamEnabled
  const gb = null
  return gb?.enabled === true
}
