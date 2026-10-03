// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { useMemo } from 'react'
import type { Tools, ToolPermissionContext } from '../Tool.js'
import { assembleToolPool } from '../tools.js'
import { useAppState } from '../state/AppState.js'
import { mergeAndFilterTools } from '../utils/toolPool.js'

/**
 * React hook that assembles the tool pool for the REPL.
 *
 * Any extra initial tools are merged with the current built-in tools.
 *
 * @param initialTools - Extra tools to include.
 * @param toolPermissionContext - Permission context for filtering
 */
export function useMergedTools(
  initialTools: Tools,
  toolPermissionContext: ToolPermissionContext,
): Tools {
  const settings = useAppState(state => state.settings)
  return useMemo(() => {
    const assembled = assembleToolPool(toolPermissionContext)

    return mergeAndFilterTools(
      initialTools,
      assembled,
      toolPermissionContext.mode,
      settings,
    )
  }, [
    initialTools,
    toolPermissionContext,
    settings,
  ])
}
