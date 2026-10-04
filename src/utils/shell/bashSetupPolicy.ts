import type { BashStatus } from './bashAvailability.js'

export function shouldPromptForBashSetup(
  status: BashStatus,
  options: { alreadyAcknowledged: boolean; resetRequested: boolean },
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (options.alreadyAcknowledged && !options.resetRequested) return false
  if (!status.ok) return true
  return platform === 'win32' && status.source !== 'git-for-windows'
}
