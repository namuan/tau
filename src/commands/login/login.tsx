import { feature } from 'bun:bundle'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { resetCostState } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js'
import { ProviderLoginFlow } from '../../components/ProviderLoginFlow.js'
import TextInput from '../../components/TextInput.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text, useInput } from '../../ink.js'
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js'
import { refreshPolicyLimits } from '../../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  getProviderAuthMethod,
  PROVIDER_AUTH_SUPPORT,
} from '../../utils/auth.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  getAPIProvider,
  isAPIProvider,
  PROVIDER_DISPLAY_NAMES,
  SELECTABLE_PROVIDERS,
  setActiveProvider,
  type APIProvider,
} from '../../utils/model/providers.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js'
import { resetUserCache } from '../../utils/user.js'
import {
  hasStoredKey,
  saveProviderKey,
  validateKeyFormat,
} from '../../services/api/auth/api_key_manager.js'
import {
  FIRECRAWL_API_KEY_ENV,
  FIRECRAWL_DISPLAY_NAME,
  FIRECRAWL_PROVIDER_KEY,
  testFirecrawlApiKey,
} from '../../tools/WebSearchTool/firecrawl.js'

// ─── Post-login refresh ──

function runPostLoginRefresh(context: LocalJSXCommandContext) {
  resetCostState()
  void refreshRemoteManagedSettings()
  void refreshPolicyLimits()
  resetUserCache()
  refreshGrowthBookAfterAuthChange()
  resetBypassPermissionsCheck()
  const appState = context.getAppState()
  void checkAndDisableBypassPermissionsIfNeeded(
    appState.toolPermissionContext,
    context.setAppState,
  )
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    resetAutoModeGateCheck()
    void checkAndDisableAutoModeIfNeeded(
      appState.toolPermissionContext,
      context.setAppState,
      appState.fastMode,
    )
  }
  context.setAppState((prev) => ({
    ...prev,
    authVersion: prev.authVersion + 1,
  }))
}

// ─── Main login entry point ──────────────────────────────────────
//
// /login is the general provider login entry point.

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args = '',
): Promise<React.ReactNode> {
  const currentProvider = getAPIProvider()
  const finish = (success: boolean) => {
    if (success) {
      context.onChangeAPIKey()
      context.setMessages(stripSignatureBlocks)
      runPostLoginRefresh(context)
    }
    onDone(success ? 'Login successful' : 'Login interrupted')
  }

  if (matchesFirecrawlArg(args)) {
    return <FirecrawlLogin onDone={finish} />
  }

  const requestedProvider = resolveLoginProviderArg(args)
  if (requestedProvider) {
    const handleDirectLoginDone = (success: boolean) => {
      if (success) {
        setActiveProvider(requestedProvider)
      }
      finish(success)
    }

    return (
      <ThirdPartyLogin
        provider={requestedProvider}
        onDone={handleDirectLoginDone}
      />
    )
  }

  return (
    <ProviderPickerLogin
      initialProvider={currentProvider}
      onDone={finish}
    />
  )
}

function matchesFirecrawlArg(args: string): boolean {
  const first = args.trim().toLowerCase().split(/\s+/)[0]
  return first === FIRECRAWL_PROVIDER_KEY || first === 'websearch'
}

function resolveLoginProviderArg(args: string): APIProvider | null {
  const normalized = args.trim().toLowerCase()
  if (!normalized) return null

  const compact = normalized.replace(/[\s_-]+/g, '')
  const first = normalized.split(/\s+/)[0]?.replace(/[-_]+/g, '') ?? ''
  const aliases: Record<string, APIProvider> = {
    commandcode: 'commandcode',
    cmd: 'commandcode',
    cmdcode: 'commandcode',
    cloudflare: 'cloudflare',
    cloudflareworkersai: 'cloudflare',
    workersai: 'cloudflare',
    workers: 'cloudflare',
    cf: 'cloudflare',
    clineauth: 'cline',
    clineaccount: 'cline',
    clinepass: 'clinepass',
    clineplus: 'clinepass',
  }

  const aliased = aliases[compact] ?? aliases[first]
  if (aliased && SELECTABLE_PROVIDERS.includes(aliased)) return aliased

  if (isAPIProvider(normalized) && SELECTABLE_PROVIDERS.includes(normalized)) {
    return normalized
  }
  if (isAPIProvider(first) && SELECTABLE_PROVIDERS.includes(first)) {
    return first
  }

  return null
}

const FIRECRAWL_LOGIN_TARGET = FIRECRAWL_PROVIDER_KEY
type LoginTarget = APIProvider | typeof FIRECRAWL_LOGIN_TARGET

const LOGIN_PROVIDERS = [
  ...SELECTABLE_PROVIDERS.filter(provider => provider !== 'lmstudio'),
  FIRECRAWL_LOGIN_TARGET,
] as const satisfies readonly LoginTarget[]

function getLoginTargetName(target: LoginTarget): string {
  if (target === FIRECRAWL_LOGIN_TARGET) return FIRECRAWL_DISPLAY_NAME
  return PROVIDER_DISPLAY_NAMES[target]
}

function getProviderAuthTypeLabel(provider: LoginTarget): string {
  if (provider === FIRECRAWL_LOGIN_TARGET) return 'Firecrawl API key'
  if (provider === 'antigravity') return 'Google login'
  if (provider === 'cloudflare') return 'Account ID / API token'

  const supported = PROVIDER_AUTH_SUPPORT[provider] ?? ['api_key']
  const supportsOAuth = supported.includes('oauth')
  const supportsApiKey = supported.includes('api_key')

  if (supportsOAuth && supportsApiKey) return 'OAuth / API key'
  if (supportsOAuth) return 'OAuth'
  return 'API key'
}

function getProviderConfiguredLabel(provider: LoginTarget): string {
  if (provider === FIRECRAWL_LOGIN_TARGET) {
    if (process.env[FIRECRAWL_API_KEY_ENV]?.trim()) return ' [env key ready]'
    return hasStoredKey(FIRECRAWL_PROVIDER_KEY) ? ' [API key saved]' : ''
  }
  const method = getProviderAuthMethod(provider)
  if (method === 'oauth') return ' [OAuth connected]'
  if (method === 'api_key') return ' [API key saved]'
  return ''
}

function ProviderPickerLogin({
  initialProvider,
  onDone,
}: {
  initialProvider: APIProvider
  onDone: (success: boolean) => void
}) {
  const [selectedProvider, setSelectedProvider] = useState<LoginTarget | null>(null)
  const initialIndex = Math.max(0, LOGIN_PROVIDERS.indexOf(initialProvider))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  useInput((_input: string, key: { return?: boolean; escape?: boolean; upArrow?: boolean; downArrow?: boolean }) => {
    if (selectedProvider) return

    if (key.escape) {
      onDone(false)
      return
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : LOGIN_PROVIDERS.length - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < LOGIN_PROVIDERS.length - 1 ? i + 1 : 0))
      return
    }
    if (key.return) {
      const provider = LOGIN_PROVIDERS[selectedIndex]
      if (provider) setSelectedProvider(provider)
    }
  })

  if (selectedProvider) {
    const providerForLogin = selectedProvider
    const handleProviderDone = (success: boolean) => {
      if (success) {
        if (providerForLogin !== FIRECRAWL_LOGIN_TARGET) {
          setActiveProvider(providerForLogin)
        }
        onDone(true)
        return
      }
      setSelectedProvider(null)
    }

    if (providerForLogin === FIRECRAWL_LOGIN_TARGET) {
      return <FirecrawlLogin onDone={handleProviderDone} />
    }
    return (
      <ThirdPartyLogin
        provider={providerForLogin}
        onDone={handleProviderDone}
      />
    )
  }

  return (
    <Dialog
      title="Login - Choose Provider"
      onCancel={() => onDone(false)}
      color="permission"
      inputGuide={(exitState: { pending: boolean; keyName: string }) =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        )
      }
    >
      <Box flexDirection="column" paddingLeft={1}>
        <Box marginBottom={1}>
          <Text bold color="claude">
            Select a provider to sign in with:
          </Text>
        </Box>
        {LOGIN_PROVIDERS.map((provider, index) => {
          const isSelected = index === selectedIndex
          return (
            <Box key={provider}>
              <Text
                bold={isSelected}
                color={isSelected ? 'claude' : undefined}
                dimColor={!isSelected}
              >
                {isSelected ? '> ' : '  '}
                {getLoginTargetName(provider)}
              </Text>
              <Text dimColor>
                {' '}({getProviderAuthTypeLabel(provider)})
                {getProviderConfiguredLabel(provider)}
              </Text>
            </Box>
          )
        })}
        <Box marginTop={1}>
          <Text dimColor>Use arrow keys, Enter to select, Esc to cancel</Text>
        </Box>
      </Box>
    </Dialog>
  )
}

// ─── Auxiliary login dialogs ───

function FirecrawlLogin({
  onDone,
}: {
  onDone: (success: boolean) => void
}) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = useState(0)
  const [state, setState] = useState<
    | { step: 'input'; error?: string }
    | { step: 'validating' }
    | { step: 'success'; message: string }
    | { step: 'warning'; message: string }
  >({ step: 'input' })
  const inputColumns = Math.max(20, (process.stdout.columns ?? 80) - 12)

  useEffect(() => {
    if (state.step !== 'success' && state.step !== 'warning') return
    const timer = setTimeout(
      () => onDone(true),
      state.step === 'warning' ? 2000 : 800,
    )
    return () => clearTimeout(timer)
  }, [onDone, state.step])

  function handleSubmit(value: string) {
    const key = value.trim()
    if (!key) {
      setState({ step: 'input', error: 'Firecrawl API key cannot be empty.' })
      return
    }

    setState({ step: 'validating' })
    const warnings: string[] = []
    const formatCheck = validateKeyFormat(FIRECRAWL_PROVIDER_KEY, key)
    if (!formatCheck.valid && formatCheck.error) {
      warnings.push(formatCheck.error)
    }

    const persistAndFinish = () => {
      saveProviderKey(FIRECRAWL_PROVIDER_KEY, key)
      process.env[FIRECRAWL_API_KEY_ENV] = key
      if (warnings.length > 0) {
        setState({
          step: 'warning',
          message: `Firecrawl key saved. Warning: ${warnings.join(' ')}`,
        })
        return
      }
      setState({
        step: 'success',
        message: 'Firecrawl key saved. WebSearch is available for all providers.',
      })
    }

    testFirecrawlApiKey(key)
      .then(testResult => {
        if (!testResult.ok) warnings.push(testResult.error)
        persistAndFinish()
      })
      .catch(() => persistAndFinish())
  }

  return (
    <Dialog
      title={`Login - ${FIRECRAWL_DISPLAY_NAME}`}
      onCancel={() => onDone(false)}
      color="permission"
    >
      <Box flexDirection="column" paddingLeft={1}>
        {state.step === 'input' && (
          <>
            <Text dimColor>
              Get your API key at:{' '}
              <Text color="suggestion">https://www.firecrawl.dev/app/api-keys</Text>
            </Text>
            <Text dimColor>
              Used by WebSearch when the active model provider has no native web search.
            </Text>
            {state.error && (
              <Box marginTop={1}>
                <Text color="error">{state.error}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text>API Key: </Text>
              <TextInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                onSubmit={handleSubmit}
                mask="*"
                placeholder="Paste your Firecrawl API key here..."
                focus={true}
                showCursor={true}
                columns={inputColumns}
                cursorOffset={apiKeyCursorOffset}
                onChangeCursorOffset={setApiKeyCursorOffset}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, Esc to cancel</Text>
            </Box>
          </>
        )}
        {state.step === 'validating' && (
          <Text color="warning">Validating Firecrawl credentials...</Text>
        )}
        {state.step === 'success' && (
          <Text color="success">{state.message}</Text>
        )}
        {state.step === 'warning' && (
          <Text color="warning">{state.message}</Text>
        )}
      </Box>
    </Dialog>
  )
}

export function Login({
  onDone,
  startingMessage,
}: {
  onDone: (success: boolean) => void
  startingMessage?: string
}) {
  return (
    <Dialog
      title="Login"
      onCancel={() => onDone(false)}
      color="permission"
      inputGuide={(exitState: { pending: boolean; keyName: string }) =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        )
      }
    >
      <ConsoleOAuthFlow
        onDone={() => onDone(true)}
        startingMessage={startingMessage}
      />
    </Dialog>
  )
}

function ThirdPartyLogin({
  provider,
  onDone,
}: {
  provider: APIProvider
  onDone: (success: boolean) => void
}) {
  const name = PROVIDER_DISPLAY_NAMES[provider]

  return (
    <Dialog
      title={`Login - ${name}`}
      onCancel={() => onDone(false)}
      color="permission"
      inputGuide={(exitState: { pending: boolean; keyName: string }) =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        )
      }
    >
      <ProviderLoginFlow provider={provider} onDone={onDone} />
    </Dialog>
  )
}
