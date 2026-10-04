import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Tau config storage uses its own root and does not fall back to Claude config', async () => {
  const envUtils = await readFile(new URL('../src/utils/envUtils.ts', import.meta.url), 'utf8')
  const env = await readFile(new URL('../src/utils/env.ts', import.meta.url), 'utf8')
  const settings = await readFile(new URL('../src/utils/settings/settings.ts', import.meta.url), 'utf8')
  assert.match(envUtils, /process\.env\.TAU_CONFIG_DIR \?\? join\(homedir\(\), '\.config', 'tau'\)/)
  assert.doesNotMatch(envUtils, /process\.env\.CLAUDE_CONFIG_DIR|join\(homedir\(\), '\.claude'\)/)
  assert.match(env, /getClaudeConfigHomeDir\(\),\s*`config\$\{fileSuffixForOauthConfig\(\)\}\.json`/)
  assert.doesNotMatch(env, /\.claude\.json|\.config\.json|CLAUDE_CONFIG_DIR/)
  assert.match(settings, /getProjectDir\(getOriginalCwd\(\)\)/)
  assert.match(settings, /'settings',/)
  assert.match(settings, /recursive:\s*true,\s*mode:\s*0o700/)
  assert.match(settings, /mode:\s*0o600/)
  assert.doesNotMatch(settings, /join\('\.claude'/)
})
