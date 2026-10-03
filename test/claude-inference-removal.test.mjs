import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  REMOVED_CLAUDE_INFERENCE_PROVIDERS,
  SELECTABLE_PROVIDERS,
} from '../src/utils/model/providerRegistry.ts'

const removedProviders = ['firstParty', 'bedrock', 'vertex', 'foundry']

test('Claude inference providers are not selectable', () => {
  assert.deepEqual(REMOVED_CLAUDE_INFERENCE_PROVIDERS, removedProviders)
  for (const provider of removedProviders) {
    assert.equal(SELECTABLE_PROVIDERS.includes(provider), false)
  }
})

test('legacy Claude provider selections cannot create an inference client', async () => {
  const client = await readFile(new URL('../src/services/api/client.ts', import.meta.url), 'utf8')
  assert.match(client, /REMOVED_CLAUDE_INFERENCE_PROVIDERS\.includes\(provider\)/)
  assert.match(client, /inference support has been removed/)
  assert.doesNotMatch(client, /@anthropic-ai\/(bedrock|vertex|foundry)-sdk/)
})
