import type { ContentBlockParam } from '@anthropic-ai/sdk/resources'
import { randomUUID } from 'crypto'
import { setPromptId } from 'src/bootstrap/state.js'
import type {
  AttachmentMessage,
  SystemMessage,
  UserMessage,
} from 'src/types/message.js'

import type { PermissionMode } from '../../types/permissions.js'
import { createUserMessage } from '../messages.js'
import { getInitialSettings } from '../settings/settings.js'
import {
  matchesKeepGoingKeyword,
  matchesNegativeKeyword,
} from '../userPromptKeywords.js'

function getPinText(): string | null {
  const pin = getInitialSettings().pin
  if (!pin?.enabled || !pin.text) return null
  return pin.text
}

export function processTextPrompt(
  input: string | Array<ContentBlockParam>,
  imageContentBlocks: ContentBlockParam[],
  imagePasteIds: number[],
  attachmentMessages: AttachmentMessage[],
  uuid?: string,
  permissionMode?: PermissionMode,
  isMeta?: boolean,
): {
  messages: (UserMessage | AttachmentMessage | SystemMessage)[]
  shouldQuery: boolean
} {
  const promptId = randomUUID()
  setPromptId(promptId)

  // Pinned constraint: appended as a SEPARATE isMeta user message so the
  // user's typed prompt stays clean in the transcript (isMeta messages are
  // hidden by VirtualMessageList). Plain text — no XML wrapper — to avoid
  // tripping providers that reject angle-bracket tags in user content. Skipped
  // for isMeta callers so internal/system-generated prompts aren't polluted.
  const pinText = isMeta ? null : getPinText()
  const pinMessage = pinText
    ? createUserMessage({ content: pinText, isMeta: true })
    : null

  const userPromptText =
    typeof input === 'string'
      ? input
      : input.find(block => block.type === 'text')?.text || ''
  const isNegative = matchesNegativeKeyword(userPromptText)
  const isKeepGoing = matchesKeepGoingKeyword(userPromptText)


  // If we have pasted images, create a message with image content
  if (imageContentBlocks.length > 0) {
    // Build content: text first, then images below
    const textContent =
      typeof input === 'string'
        ? input.trim()
          ? [{ type: 'text' as const, text: input }]
          : []
        : input
    const userMessage = createUserMessage({
      content: [...textContent, ...imageContentBlocks],
      uuid: uuid,
      imagePasteIds: imagePasteIds.length > 0 ? imagePasteIds : undefined,
      permissionMode,
      isMeta: isMeta || undefined,
    })

    return {
      messages: [
        userMessage,
        ...attachmentMessages,
        ...(pinMessage ? [pinMessage] : []),
      ],
      shouldQuery: true,
    }
  }

  const userMessage = createUserMessage({
    content: input,
    uuid,
    permissionMode,
    isMeta: isMeta || undefined,
  })

  return {
    messages: [
      userMessage,
      ...attachmentMessages,
      ...(pinMessage ? [pinMessage] : []),
    ],
    shouldQuery: true,
  }
}
