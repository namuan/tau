import { getSettingsWithErrors } from './settings.js'
import type { SettingsWithErrors } from './validation.js'

export function getSettingsWithAllErrors(): SettingsWithErrors {
  return getSettingsWithErrors()
}
