const warnedSources = new Set<string>()

export function stripLegacySandboxSetting(value: unknown, source: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'sandbox')) {
    return value
  }

  if (!warnedSources.has(source)) {
    warnedSources.add(source)
    process.stderr.write(`Warning: ${source} contains sandbox.* settings, which Tau no longer supports; the settings are ignored.\n`)
  }

  const settings: Record<string, unknown> = { ...value }
  delete settings.sandbox
  return settings
}
