import { feature } from 'bun:bundle'
import uniqBy from 'lodash-es/uniqBy.js'
import { CHEAP_MODE_CORE_TOOL_NAME_SET } from '../constants/cheapModeTools.js'
import { COORDINATOR_MODE_ALLOWED_TOOLS } from '../constants/tools.js'
import type { Tool, ToolPermissionContext, Tools } from '../Tool.js'
import { getPowerModeFromSettings } from './powerMode.js'
import { filterDisabledPrebuiltTools } from './prebuiltToolToggles.js'
import type { SettingsJson } from './settings/types.js'

type SettingsWithPrebuiltToolToggles = Pick<
  SettingsJson,
  'disabledPrebuiltTools' | 'powerMode'
>

// Dead code elimination: conditional imports for feature-gated modules
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Filters a tool array to the set allowed in coordinator mode.
 * Shared between the REPL path (mergeAndFilterTools) and the headless
 * path (main.tsx) so both stay in sync.
 *
 */
export function applyCoordinatorToolFilter(tools: Tools): Tools {
  return tools.filter(
    t =>
      COORDINATOR_MODE_ALLOWED_TOOLS.has(t.name),
  )
}

/**
 * Pure function that merges tool pools and applies coordinator mode filtering.
 *
 * Lives in a React-free file so print.ts can import it without pulling
 * react/ink into the SDK module graph. The useMergedTools hook delegates
 * to this function inside useMemo.
 *
 * @param initialTools - Extra tools to include.
 * @param assembled - Tools from assembleToolPool.
 * @param mode - The permission context mode.
 * @returns Merged, deduplicated, and coordinator-filtered tool array.
 */
export function mergeAndFilterTools(
  initialTools: Tools,
  assembled: Tools,
  mode: ToolPermissionContext['mode'],
  settings: SettingsWithPrebuiltToolToggles = {},
): Tools {
  // Merge initialTools on top - they take precedence in deduplication after
  // removing optional prebuilt tools disabled mid-session via /tools.
  // initialTools may include built-in tools (from getTools() in REPL.tsx) which
  // overlap with assembled tools. uniqBy handles this deduplication.
  // Partition-sort for prompt-cache stability (same as assembleToolPool):
  // built-ins must stay a contiguous prefix for the server's cache policy.
  const filteredInitialTools = filterDisabledPrebuiltTools(initialTools, settings)
  const merged = uniqBy([...filteredInitialTools, ...assembled], 'name')
  const cheap = getPowerModeFromSettings(settings) === 'cheap'
  const tools = cheap
    ? merged.filter(tool => CHEAP_MODE_CORE_TOOL_NAME_SET.has(tool.name))
    : merged.sort((a, b) => a.name.localeCompare(b.name))

  if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
    if (coordinatorModeModule.isCoordinatorMode()) {
      return applyCoordinatorToolFilter(tools)
    }
  }

  return tools
}
