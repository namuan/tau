import type { ToolPermissionContext, ToolUseContext } from '../../../Tool.js'
import {
  CLAUDE_FOLDER_PERMISSION_PATTERN,
  FILE_EDIT_TOOL_NAME,
  GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN,
} from '../../../tools/FileEditTool/constants.js'
import { enableBypassPermissionsModeForSession } from '../../../utils/permissions/bypassPermissionsMode.js'
import { generateSuggestions } from '../../../utils/permissions/filesystem.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import type { ToolUseConfirm } from '../PermissionRequest.js'
import type {
  FileOperationType,
  PermissionOption,
} from './permissionOptions.js'

export type PermissionHandlerParams = {
  path: string | null
  toolUseConfirm: ToolUseConfirm
  toolPermissionContext: ToolPermissionContext
  toolUseContext: ToolUseContext
  onDone: () => void
  onReject: () => void
  operationType: FileOperationType
}

export type PermissionHandlerOptions = {
  feedback?: string
  scope?: 'claude-folder' | 'global-claude-folder'
}

function handleAcceptOnce(
  { toolUseConfirm, onDone }: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  onDone()
  toolUseConfirm.onAllow(toolUseConfirm.input, [], options?.feedback)
}

function handleAcceptSession(
  {
    path,
    toolUseConfirm,
    toolPermissionContext,
    onDone,
    operationType,
  }: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  if (
    options?.scope === 'claude-folder' ||
    options?.scope === 'global-claude-folder'
  ) {
    const pattern =
      options.scope === 'global-claude-folder'
        ? GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN
        : CLAUDE_FOLDER_PERMISSION_PATTERN
    const suggestions: PermissionUpdate[] = [
      {
        type: 'addRules',
        rules: [
          {
            toolName: FILE_EDIT_TOOL_NAME,
            ruleContent: pattern,
          },
        ],
        behavior: 'allow',
        destination: 'session',
      },
    ]
    onDone()
    toolUseConfirm.onAllow(toolUseConfirm.input, suggestions)
    return
  }

  const suggestions = path
    ? generateSuggestions(path, operationType, toolPermissionContext)
    : []

  onDone()
  toolUseConfirm.onAllow(toolUseConfirm.input, suggestions)
}

function handleBypassPermissions(
  { toolUseConfirm, toolUseContext, onDone, onReject }: PermissionHandlerParams,
): void {
  if (!enableBypassPermissionsModeForSession(toolUseContext)) {
    onDone()
    onReject()
    toolUseConfirm.onReject(
      'Bypass Permissions mode is disabled by settings or policy.',
    )
    return
  }

  onDone()
  toolUseConfirm.onAllow(toolUseConfirm.input, [])
}

function handleReject(
  { toolUseConfirm, onDone, onReject }: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  onDone()
  onReject()
  toolUseConfirm.onReject(options?.feedback)
}

export const PERMISSION_HANDLERS: Record<
  PermissionOption['type'],
  (params: PermissionHandlerParams, options?: PermissionHandlerOptions) => void
> = {
  'accept-once': handleAcceptOnce,
  'accept-session': handleAcceptSession,
  'bypass-permissions': handleBypassPermissions,
  reject: handleReject,
}
