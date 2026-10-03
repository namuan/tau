import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  getProviderApiKey,
  getProviderBaseUrl,
  validateProviderAuth,
} from 'src/utils/auth.js'
import { getUserAgent } from 'src/utils/http.js'
import {
  getAPIProvider,
  isThirdPartyProvider,
} from 'src/utils/model/providers.js'
import { REMOVED_CLAUDE_INFERENCE_PROVIDERS } from 'src/utils/model/providerRegistry.js'
import { createProviderShim } from './providers/providerShim.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import { getSessionId } from '../../bootstrap/state.js'
import { isDebugToStdErr, logForDebugging } from '../../utils/debug.js'
import { resolveEffectiveAPIProvider } from './providerRouting.js'

function createStderrLogger(): ClientOptions['logger'] {
  return {
    error: (msg, ...args) => console.error('[Anthropic SDK ERROR]', msg, ...args),
    warn: (msg, ...args) => console.error('[Anthropic SDK WARN]', msg, ...args),
    info: (msg, ...args) => console.error('[Anthropic SDK INFO]', msg, ...args),
    debug: (msg, ...args) => console.error('[Anthropic SDK DEBUG]', msg, ...args),
  }
}

export async function getAnthropicClient({
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<Anthropic> {
  const provider = resolveEffectiveAPIProvider(getAPIProvider(), model)
  if (REMOVED_CLAUDE_INFERENCE_PROVIDERS.includes(provider)) {
    throw new Error(`${provider} inference support has been removed. Select a supported provider with /provider.`)
  }
  if (!isThirdPartyProvider(provider)) {
    throw new Error(`Unsupported inference provider: ${provider}`)
  }

  const authCheck = validateProviderAuth(provider)
  if (!authCheck.valid) {
    throw new Error(authCheck.reason)
  }

  if (authCheck.method === 'oauth') {
    const { resolveProviderAuth } = await import('./auth/provider_auth.js')
    await resolveProviderAuth(provider)
  }

  if (provider === 'agentrouter') {
    const agentRouterKey = getProviderApiKey('agentrouter')
    if (!agentRouterKey) {
      throw new Error('No credentials found for agentrouter. Set AGENT_ROUTER_TOKEN or run `/login`.')
    }
    const customHeaders = getCustomHeaders()
    const defaultHeaders: Record<string, string> = {
      'x-app': 'cli',
      'User-Agent': getUserAgent(),
      'X-Claude-Code-Session-Id': getSessionId(),
      ...customHeaders,
    }
    const baseURL = getProviderBaseUrl('agentrouter').replace(/\/v1\/?$/i, '/')
    return new Anthropic({
      apiKey: agentRouterKey,
      authToken: agentRouterKey,
      baseURL,
      defaultHeaders,
      maxRetries,
      timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
      dangerouslyAllowBrowser: true,
      fetchOptions: getProxyFetchOptions({
        forAnthropicAPI: true,
      }) as ClientOptions['fetchOptions'],
      ...(fetchOverride && { fetch: fetchOverride }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    })
  }

  logForDebugging(`[API:route] Using provider shim for ${provider}, source=${source ?? 'unknown'}`)
  return createProviderShim(provider, source) as unknown as Anthropic
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {}
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS
  if (!customHeadersEnv) return customHeaders

  for (const headerString of customHeadersEnv.split(/\r?\n/)) {
    const colonIdx = headerString.indexOf(':')
    if (colonIdx === -1) continue
    const name = headerString.slice(0, colonIdx).trim()
    const value = headerString.slice(colonIdx + 1).trim()
    if (name) customHeaders[name] = value
  }

  return customHeaders
}
