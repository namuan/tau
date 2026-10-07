import { useEffect, useRef } from 'react'
import type { ToolUseConfirm } from '../../components/permissions/PermissionRequest.js'
import { useSetAppState } from '../../state/AppState.js'

export function usePermissionRequestLogging(
  toolUseConfirm: ToolUseConfirm,
): void {
  const setAppState = useSetAppState()
  const loggedToolUseID = useRef<string | null>(null)

  useEffect(() => {
    if (loggedToolUseID.current === toolUseConfirm.toolUseID) return
    loggedToolUseID.current = toolUseConfirm.toolUseID
    setAppState(prev => ({
      ...prev,
      attribution: {
        ...prev.attribution,
        permissionPromptCount: prev.attribution.permissionPromptCount + 1,
      },
    }))
  }, [toolUseConfirm.toolUseID, setAppState])
}
