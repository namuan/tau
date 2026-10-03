import { getMainThreadAgentType } from '../bootstrap/state.js'
import type { HookResultMessage } from '../types/message.js'
import { createAttachmentMessage } from './attachments.js'
import { logForDebugging } from './debug.js'
import { isBareMode } from './envUtils.js'
import { updateWatchPaths } from './hooks/fileChangedWatcher.js'
import { executeSessionStartHooks, executeSetupHooks } from './hooks.js'

type SessionStartHooksOptions = {
  sessionId?: string
  agentType?: string
  model?: string
  forceSyncExecution?: boolean
}

// Set by processSessionStartHooks when a hook emits initialUserMessage;
// consumed once by takeInitialUserMessage. This side channel avoids changing
// the Promise<HookResultMessage[]> return type that main.tsx and print.ts
// both already await on (sessionStartHooksPromise is kicked in main.tsx and
// joined later — rippling a structural return-type change through that
// handoff would touch five callsites for what is a print-mode-only value).
let pendingInitialUserMessage: string | undefined

export function takeInitialUserMessage(): string | undefined {
  const v = pendingInitialUserMessage
  pendingInitialUserMessage = undefined
  return v
}

// Note to CLAUDE: do not add ANY "warmup" logic. It is **CRITICAL** that you do not add extra work on startup.
export async function processSessionStartHooks(
  source: 'startup' | 'resume' | 'clear' | 'compact',
  {
    sessionId,
    agentType,
    model,
    forceSyncExecution,
  }: SessionStartHooksOptions = {},
): Promise<HookResultMessage[]> {
  // --bare skips all hooks.
  if (isBareMode()) {
    return []
  }
  const hookMessages: HookResultMessage[] = []
  const additionalContexts: string[] = []
  const allWatchPaths: string[] = []


  // Execute SessionStart hooks, ignoring blocking errors
  // Use the provided agentType or fall back to the one stored in bootstrap state
  const resolvedAgentType = agentType ?? getMainThreadAgentType()
  for await (const hookResult of executeSessionStartHooks(
    source,
    sessionId,
    resolvedAgentType,
    model,
    undefined,
    undefined,
    forceSyncExecution,
  )) {
    if (hookResult.message) {
      hookMessages.push(hookResult.message)
    }
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      additionalContexts.push(...hookResult.additionalContexts)
    }
    if (hookResult.initialUserMessage) {
      pendingInitialUserMessage = hookResult.initialUserMessage
    }
    if (hookResult.watchPaths && hookResult.watchPaths.length > 0) {
      allWatchPaths.push(...hookResult.watchPaths)
    }
  }

  if (allWatchPaths.length > 0) {
    updateWatchPaths(allWatchPaths)
  }

  // If hooks provided additional context, add it as a message
  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: 'hook_additional_context',
      content: additionalContexts,
      hookName: 'SessionStart',
      toolUseID: 'SessionStart',
      hookEvent: 'SessionStart',
    })
    hookMessages.push(contextMessage)
  }

  return hookMessages
}

export async function processSetupHooks(
  trigger: 'init' | 'maintenance',
  { forceSyncExecution }: { forceSyncExecution?: boolean } = {},
): Promise<HookResultMessage[]> {
  // Same rationale as processSessionStartHooks above.
  if (isBareMode()) {
    return []
  }
  const hookMessages: HookResultMessage[] = []
  const additionalContexts: string[] = []

  for await (const hookResult of executeSetupHooks(
    trigger,
    undefined,
    undefined,
    forceSyncExecution,
  )) {
    if (hookResult.message) {
      hookMessages.push(hookResult.message)
    }
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      additionalContexts.push(...hookResult.additionalContexts)
    }
  }

  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: 'hook_additional_context',
      content: additionalContexts,
      hookName: 'Setup',
      toolUseID: 'Setup',
      hookEvent: 'Setup',
    })
    hookMessages.push(contextMessage)
  }

  return hookMessages
}
