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

test('first-party advisor request support is removed while historical blocks remain compatible', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/services/api/claude.ts', import.meta.url), 'utf8')
  const advisor = await readFile(new URL('../src/utils/advisor.ts', import.meta.url), 'utf8')
  const messages = await readFile(new URL('../src/utils/messages.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /--advisor|advisorModel|canUserConfigureAdvisor/)
  assert.doesNotMatch(api, /ADVISOR_BETA_HEADER|advisor_20260301|advisorModel/)
  assert.match(api, /messagesForAPI = stripAdvisorBlocks\(messagesForAPI\)/)
  assert.match(advisor, /isAdvisorBlock/)
  assert.match(advisor, /getAdvisorUsage/)
  assert.match(messages, /Strip advisor blocks from messages/)
})

test('first-party Anthropic capability discovery is absent from startup and context sizing', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const context = await readFile(new URL('../src/utils/context.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /refreshModelCapabilities|modelCapabilities/)
  assert.doesNotMatch(context, /getModelCapability|modelCapabilities/)
})

test('legacy Claude provider selections are rejected by routing and model selection', async () => {
  const client = await readFile(new URL('../src/services/api/client.ts', import.meta.url), 'utf8')
  const providers = await readFile(new URL('../src/utils/model/providers.ts', import.meta.url), 'utf8')
  const catalog = await readFile(new URL('../src/utils/model/providerCatalog.ts', import.meta.url), 'utf8')
  const login = await readFile(new URL('../src/commands/login/login.tsx', import.meta.url), 'utf8')
  const remoteSettings = await readFile(new URL('../src/services/remoteManagedSettings/syncCache.ts', import.meta.url), 'utf8')
  const settingsSchema = await readFile(new URL('../src/utils/settings/types.ts', import.meta.url), 'utf8')
  const oauthFlow = await readFile(new URL('../src/components/ConsoleOAuthFlow.tsx', import.meta.url), 'utf8')
  const auth = await readFile(new URL('../src/utils/auth.ts', import.meta.url), 'utf8')
  const modelOptions = await readFile(new URL('../src/utils/model/modelOptions.ts', import.meta.url), 'utf8')
  const modelConfigs = await readFile(new URL('../src/utils/model/configs.ts', import.meta.url), 'utf8')
  const status = await readFile(new URL('../src/utils/status.tsx', import.meta.url), 'utf8')
  const repl = await readFile(new URL('../src/screens/REPL.tsx', import.meta.url), 'utf8')
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(client, /REMOVED_CLAUDE_INFERENCE_PROVIDERS\.includes\(provider\)/)
  assert.match(client, /inference support has been removed/)
  assert.match(providers, /API_PROVIDERS\.filter\([\s\S]{0,100}REMOVED_CLAUDE_INFERENCE_PROVIDERS\.includes\(provider\)/)
  assert.match(providers, /REMOVED_CLAUDE_INFERENCE_PROVIDERS\.includes\(provider\)/)
  assert.match(catalog, /BROWSABLE_MODEL_PROVIDERS:[^=]+=[\s\S]{0,80}SELECTABLE_PROVIDERS/)
  assert.doesNotMatch(catalog, /ANTHROPIC_MODELS/)
  assert.doesNotMatch(login, /anthropic: 'firstParty'|claude: 'firstParty'/)
  assert.doesNotMatch(client, /@anthropic-ai\/(bedrock|vertex|foundry)-sdk/)
  assert.doesNotMatch(remoteSettings, /getAPIProvider|3p provider users/)
  assert.match(remoteSettings, /isFirstPartyAnthropicBaseUrl/)
  assert.doesNotMatch(settingsSchema, /awsAuthRefresh|awsCredentialExport|gcpAuthRefresh/)
  assert.doesNotMatch(auth, /awsAuthRefresh|awsCredentialExport|gcpAuthRefresh|isUsing3PServices/)
  assert.doesNotMatch(oauthFlow, /platform_setup|Amazon Bedrock|Vertex AI|Microsoft Foundry/)
  assert.doesNotMatch(modelOptions, /isClaudeAISubscriber|isMaxSubscriber|isTeamPremiumSubscriber|PAYG 1P|firstParty|formatModelPricing/)
  assert.doesNotMatch(modelConfigs, /^\s*(bedrock|vertex|foundry):/m)
  assert.doesNotMatch(status, /getClaudeAiUserDefaultModelDescription|isClaudeAISubscriber/)
  assert.doesNotMatch(repl, /AwsAuthStatusBox/)
  assert.doesNotMatch(main, /3P providers \(Bedrock\/Vertex\/Foundry\) use their own credentials/)
  assert.doesNotMatch(main, /migrateLegacyOpusToCurrent|migrateSonnet45ToSonnet46|resetProToOpusDefault|migrateOpusToOpus1m|fetchBootstrapData/)
})
