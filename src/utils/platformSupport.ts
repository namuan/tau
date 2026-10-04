export function getUnsupportedPlatformMessage(
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform === 'darwin') return null
  return 'Tau is supported only on macOS. Linux, WSL, and Windows are not supported.'
}
