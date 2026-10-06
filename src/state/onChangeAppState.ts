import { setMainLoopModelOverride } from '../bootstrap/state.js'
import { clearApiKeyHelperCache } from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'
import { notifyPermissionModeChanged } from '../utils/sessionState.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { recordTaskOutcomes } from '../utils/task/taskOutcomes.js'
import type { AppState } from './AppStateStore.js'

export function onChangeAppState({
  newState,
  oldState,
}: {
  newState: AppState
  oldState: AppState
}) {
  // Route permission-mode changes from every state update to the SDK status
  // stream through the single listener registered in print.ts.
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    notifyPermissionModeChanged(newMode)
  }

  // tasks — single choke point for finished-task outcomes. A task leaves
  // AppState by many paths (framework eviction once its notification is
  // queued, eager eviction, /clear); recording it here keeps TaskStop and
  // TaskOutput answering with its real outcome after it is gone.
  if (newState.tasks !== oldState.tasks) {
    try {
      recordTaskOutcomes(oldState.tasks ?? {}, newState.tasks ?? {})
    } catch (error) {
      logError(toError(error))
    }
  }

  // mainLoopModel: remove it from settings?
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel === null
  ) {
    // Remove from settings
    updateSettingsForSource('userSettings', { model: undefined })
    setMainLoopModelOverride(null)
  }

  // mainLoopModel: add it to settings?
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel !== null
  ) {
    // Save to settings
    updateSettingsForSource('userSettings', { model: newState.mainLoopModel })
    setMainLoopModelOverride(newState.mainLoopModel)
  }

  // expandedView → persist as showExpandedTodos + showSpinnerTree for backwards compat
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === 'tasks'
    const showSpinnerTree = newState.expandedView === 'teammates'
    if (
      getGlobalConfig().showExpandedTodos !== showExpandedTodos ||
      getGlobalConfig().showSpinnerTree !== showSpinnerTree
    ) {
      saveGlobalConfig(current => ({
        ...current,
        showExpandedTodos,
        showSpinnerTree,
      }))
    }
  }

  // verbose
  if (
    newState.verbose !== oldState.verbose &&
    getGlobalConfig().verbose !== newState.verbose
  ) {
    const verbose = newState.verbose
    saveGlobalConfig(current => ({
      ...current,
      verbose,
    }))
  }

  // tungstenPanelVisible (ant-only tmux panel sticky toggle)
  if (process.env.USER_TYPE === 'ant') {
    if (
      newState.tungstenPanelVisible !== oldState.tungstenPanelVisible &&
      newState.tungstenPanelVisible !== undefined &&
      getGlobalConfig().tungstenPanelVisible !== newState.tungstenPanelVisible
    ) {
      const tungstenPanelVisible = newState.tungstenPanelVisible
      saveGlobalConfig(current => ({ ...current, tungstenPanelVisible }))
    }
  }

  // Settings changes invalidate the API key helper cache.
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache()

      // Re-apply environment variables when settings.env changes
      // This is additive-only: new vars are added, existing may be overwritten, nothing is deleted
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables()
      }
    } catch (error) {
      logError(toError(error))
    }
  }
}
