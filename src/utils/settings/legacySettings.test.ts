import { expect, test } from 'bun:test'
import { stripLegacySandboxSetting } from './legacySettings.js'

test('legacy sandbox settings are warned about and stripped without mutating the source', () => {
  const warnings: string[] = []
  const write = process.stderr.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    warnings.push(String(chunk))
    return true
  }) as typeof process.stderr.write

  try {
    const settings = { sandbox: { enabled: true }, permissions: { allow: ['Bash(ls)'] } }
    const stripped = stripLegacySandboxSetting(settings, 'legacy test settings')
    const repeated = stripLegacySandboxSetting(settings, 'legacy test settings')

    expect(stripped).toEqual({ permissions: { allow: ['Bash(ls)'] } })
    expect(repeated).toEqual(stripped)
    expect(settings.sandbox).toEqual({ enabled: true })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('the settings are ignored')
  } finally {
    process.stderr.write = write
  }
})
