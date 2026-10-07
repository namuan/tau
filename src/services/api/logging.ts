import { APIError } from '@anthropic-ai/sdk'
import { addToTotalDurationState, setLastApiCompletionTimestamp } from 'src/bootstrap/state.js'
import { logForDebugging } from 'src/utils/debug.js'
import { logError } from 'src/utils/log.js'
import type { NonNullableUsage } from '../../entrypoints/sdk/sdkUtilityTypes.js'
import { EMPTY_USAGE } from './emptyUsage.js'
import { extractConnectionErrorDetails } from './errorUtils.js'

export type { NonNullableUsage }
export { EMPTY_USAGE }

function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const body = error.error as { error?: { message?: string } } | undefined
    if (body?.error?.message) return body.error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function logAPIError({
  error,
  clientRequestId,
}: {
  error: unknown
  clientRequestId?: string
  [key: string]: unknown
}): void {
  const connectionDetails = extractConnectionErrorDetails(error)
  if (connectionDetails) {
    const sslLabel = connectionDetails.isSSLError ? ' (SSL error)' : ''
    logForDebugging(
      `Connection error details: code=${connectionDetails.code}${sslLabel}, message=${connectionDetails.message}`,
      { level: 'error' },
    )
  }

  if (clientRequestId) {
    logForDebugging(
      `API error x-client-request-id=${clientRequestId} (give this to the API team for server-log lookup)`,
      { level: 'error' },
    )
  }

  logError(error instanceof Error ? error : new Error(getErrorMessage(error)))
}

export function logAPISuccessAndDuration({
  start,
  startIncludingRetries,
}: {
  start: number
  startIncludingRetries: number
  [key: string]: unknown
}): void {
  const durationMs = Date.now() - start
  const durationMsIncludingRetries = Date.now() - startIncludingRetries
  addToTotalDurationState(durationMsIncludingRetries, durationMs)
  setLastApiCompletionTimestamp(Date.now())
}
