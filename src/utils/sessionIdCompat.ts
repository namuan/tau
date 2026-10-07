

export function toCompatSessionId(id: string): string {
  if (!id.startsWith('cse_')) return id
  if (
    !true
  ) {
    return id
  }
  return 'session_' + id.slice('cse_'.length)
}
