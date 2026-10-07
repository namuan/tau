import { feature } from 'bun:bundle'
import { registerHookCallbacks } from '../bootstrap/state.js'
import type { HookInput, HookJSONOutput } from '../entrypoints/agentSdkTypes.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { inputSchema as editInputSchema } from '../tools/FileEditTool/types.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { FILE_READ_TOOL_NAME } from '../tools/FileReadTool/prompt.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import { GlobTool } from '../tools/GlobTool/GlobTool.js'
import { GLOB_TOOL_NAME } from '../tools/GlobTool/prompt.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { GREP_TOOL_NAME } from '../tools/GrepTool/prompt.js'
import type { HookCallback } from '../types/hooks.js'
import {
  detectSessionFileType,
  detectSessionPatternType,
  isAutoMemFile,
} from './memoryFileDetection.js'

const teamMemPaths = feature('TEAMMEM')
  ? (require('../memdir/teamMemPaths.js') as typeof import('../memdir/teamMemPaths.js'))
  : null
const teamMemWatcher = feature('TEAMMEM')
  ? (require('../services/teamMemorySync/watcher.js') as typeof import('../services/teamMemorySync/watcher.js'))
  : null

function getFilePathFromInput(
  toolName: string,
  toolInput: unknown,
): string | null {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    case FILE_EDIT_TOOL_NAME: {
      const parsed = editInputSchema().safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    case FILE_WRITE_TOOL_NAME: {
      const parsed = FileWriteTool.inputSchema.safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    default:
      return null
  }
}

function getSessionFileTypeFromInput(
  toolName: string,
  toolInput: unknown,
): 'session_memory' | 'session_transcript' | null {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput)
      return parsed.success ? detectSessionFileType(parsed.data.file_path) : null
    }
    case GREP_TOOL_NAME: {
      const parsed = GrepTool.inputSchema.safeParse(toolInput)
      if (!parsed.success) return null
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path)
        if (pathType) return pathType
      }
      return parsed.data.glob
        ? detectSessionPatternType(parsed.data.glob)
        : null
    }
    case GLOB_TOOL_NAME: {
      const parsed = GlobTool.inputSchema.safeParse(toolInput)
      if (!parsed.success) return null
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path)
        if (pathType) return pathType
      }
      return detectSessionPatternType(parsed.data.pattern)
    }
    default:
      return null
  }
}

export function isMemoryFileAccess(
  toolName: string,
  toolInput: unknown,
): boolean {
  if (getSessionFileTypeFromInput(toolName, toolInput) === 'session_memory') {
    return true
  }

  const filePath = getFilePathFromInput(toolName, toolInput)
  return !!filePath && (
    isAutoMemFile(filePath) ||
    (feature('TEAMMEM') && teamMemPaths!.isTeamMemFile(filePath))
  )
}

async function handleTeamMemoryWrite(
  input: HookInput,
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PostToolUse') return {}
  if (
    !feature('TEAMMEM') ||
    ![FILE_EDIT_TOOL_NAME, FILE_WRITE_TOOL_NAME].includes(input.tool_name)
  ) {
    return {}
  }

  const filePath = getFilePathFromInput(input.tool_name, input.tool_input)
  if (filePath && teamMemPaths!.isTeamMemFile(filePath)) {
    teamMemWatcher?.notifyTeamMemoryWrite()
  }
  return {}
}

export function registerTeamMemoryAccessHooks(): void {
  const hook: HookCallback = {
    type: 'callback',
    callback: handleTeamMemoryWrite,
    timeout: 1,
    internal: true,
  }

  registerHookCallbacks({
    PostToolUse: [
      { matcher: FILE_EDIT_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_WRITE_TOOL_NAME, hooks: [hook] },
    ],
  })
}
