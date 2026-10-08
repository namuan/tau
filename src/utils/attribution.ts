import { getMainLoopModel, getPublicModelDisplayName, getPublicModelName } from './model/model.js'
import { getInitialSettings } from './settings/settings.js'
import { isUndercover } from './undercover.js'
import { isInternalModelRepoCached } from './commitAttribution.js'

export function getAttributionTexts(): { commit: string } {
  if (process.env.USER_TYPE === 'ant' && isUndercover()) {
    return { commit: '' }
  }

  const model = getMainLoopModel()
  const isKnownPublicModel = getPublicModelDisplayName(model) !== null
  const modelName =
    isInternalModelRepoCached() || isKnownPublicModel
      ? getPublicModelName(model)
      : 'Claude Opus 4.8'
  const defaultCommit = `Co-Authored-By: ${modelName} <noreply@anthropic.com>`
  const settings = getInitialSettings()

  if (settings.attribution) {
    return { commit: settings.attribution.commit ?? defaultCommit }
  }

  if (settings.includeCoAuthoredBy === false) {
    return { commit: '' }
  }

  return { commit: defaultCommit }
}
