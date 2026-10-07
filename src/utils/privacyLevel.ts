export function isEssentialTrafficOnly(): boolean {
  return Boolean(process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
}

export function getEssentialTrafficOnlyReason(): string | null {
  return process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    ? 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'
    : null
}
