import { getCursorModelDisplayName } from '../../lanes/cursor/catalog.js'
import { getAntigravityModelDisplayName } from '../../services/api/providers/gemini_code_assist.js'
import { getCommandCodeModelDisplayName } from './commandCodeThinking.js'
import { getClinePassModelDisplayName } from './clinePassCatalog.js'
import type { APIProvider } from './providers.js'

export function getProviderModelDisplayName(
  provider: APIProvider,
  modelId: string,
): string | null {
  switch (provider) {
    case 'cursor':
      return getCursorModelDisplayName(modelId)
    case 'antigravity':
      return getAntigravityModelDisplayName(modelId)
    case 'commandcode':
      return getCommandCodeModelDisplayName(modelId)
    case 'clinepass':
      return getClinePassModelDisplayName(modelId)
    default:
      return null
  }
}
