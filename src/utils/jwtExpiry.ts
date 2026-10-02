import { jsonParse } from './slowOperations.js'

export function decodeJwtExpiry(token: string): number | null {
  const jwt = token.startsWith('sk-ant-si-')
    ? token.slice('sk-ant-si-'.length)
    : token
  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const payload: unknown = jsonParse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    )
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'exp' in payload &&
      typeof payload.exp === 'number'
    ) {
      return payload.exp
    }
    return null
  } catch {
    return null
  }
}
