export type SessionState = 'idle' | 'running' | 'requires_action'

export type RequiresActionDetails = {
  tool_name: string
  action_description: string
  tool_use_id: string
  request_id: string
  input?: Record<string, unknown>
}

import { isEnvTruthy } from './envUtils.js'
import type { PermissionMode } from './permissions/PermissionMode.js'
import { enqueueSdkEvent } from './sdkEventQueue.js'

type PermissionModeChangedListener = (mode: PermissionMode) => void

let permissionModeListener: PermissionModeChangedListener | null = null
let currentState: SessionState = 'idle'

export function setPermissionModeChangedListener(
  cb: PermissionModeChangedListener | null,
): void {
  permissionModeListener = cb
}

export function getSessionState(): SessionState {
  return currentState
}

export function notifySessionStateChanged(state: SessionState): void {
  currentState = state
  if (isEnvTruthy(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS)) {
    enqueueSdkEvent({
      type: 'system',
      subtype: 'session_state_changed',
      state,
    })
  }
}

export function notifyPermissionModeChanged(mode: PermissionMode): void {
  permissionModeListener?.(mode)
}
