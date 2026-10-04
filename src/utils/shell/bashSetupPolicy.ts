import type { BashStatus } from './bashAvailability.js'

export function shouldPromptForBashSetup(
  status: BashStatus,
  options: { alreadyAcknowledged: boolean; resetRequested: boolean },
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'darwin') return false
  if (options.alreadyAcknowledged && !options.resetRequested) return false
  return !status.ok
}
