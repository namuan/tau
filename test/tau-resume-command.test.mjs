import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('resume hints and cross-project resume commands use Tau', async () => {
  const shutdown = await readFile(new URL('../src/utils/gracefulShutdown.ts', import.meta.url), 'utf8')
  const crossProject = await readFile(new URL('../src/utils/crossProjectResume.ts', import.meta.url), 'utf8')
  const tips = await readFile(new URL('../src/services/tips/tipRegistry.ts', import.meta.url), 'utf8')
  assert.match(shutdown, /\$\{PRODUCT_COMMAND\} --resume/)
  assert.match(crossProject, /\$\{PRODUCT_COMMAND\} --resume/)
  assert.match(tips, /\$\{PRODUCT_COMMAND\} --continue or \$\{PRODUCT_COMMAND\} --resume/)
  assert.doesNotMatch(shutdown, /claude --resume/)
  assert.doesNotMatch(crossProject, /claude --resume/)
  assert.doesNotMatch(tips, /claude --continue|claude --resume/)
})
