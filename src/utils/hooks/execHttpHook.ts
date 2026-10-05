import axios from 'axios'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import { createCombinedAbortSignal } from '../combinedAbortSignal.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import { getProxyUrl, shouldBypassProxy } from '../proxy.js'
// Import as namespace so spyOn works in tests (direct imports bypass spies)
import * as settingsModule from '../settings/settings.js'
import type { HttpHook } from '../settings/types.js'
import { ssrfGuardedLookup } from './ssrfGuard.js'

const DEFAULT_HTTP_HOOK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes (matches TOOL_HOOK_EXECUTION_TIMEOUT_MS)

/**
 * Read HTTP hook allowlist restrictions from merged settings (all sources).
 * Arrays concatenate across settings sources.
 * When allowManagedHooksOnly is set in managed settings, only admin-defined
 * hooks run anyway, so no separate lock-down boolean is needed here.
 */
function getHttpHookPolicy(): {
  allowedUrls: string[] | undefined
  allowedEnvVars: string[] | undefined
} {
  const settings = settingsModule.getInitialSettings()
  return {
    allowedUrls: settings.allowedHttpHookUrls,
    allowedEnvVars: settings.httpHookAllowedEnvVars,
  }
}

/**
 * Match a URL against a pattern with * as a wildcard (any characters).
 * Same semantics as the MCP server allowlist patterns.
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`).test(url)
}

/**
 * Strip CR, LF, and NUL bytes from a header value to prevent HTTP header
 * injection (CRLF injection) via env var values or hook-configured header
 * templates. A malicious env var like "token\r\nX-Evil: 1" would otherwise
 * inject a second header into the request.
 */
function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00]/g, '')
}

/**
 * Interpolate $VAR_NAME and ${VAR_NAME} patterns in a string using process.env,
 * but only for variable names present in the allowlist. References to variables
 * not in the allowlist are replaced with empty strings to prevent exfiltration
 * of secrets via project-configured HTTP hooks.
 *
 * The result is sanitized to strip CR/LF/NUL bytes to prevent header injection.
 */
function interpolateEnvVars(
  value: string,
  allowedEnvVars: ReadonlySet<string>,
): string {
  const interpolated = value.replace(
    /\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g,
    (_, braced, unbraced) => {
      const varName = braced ?? unbraced
      if (!allowedEnvVars.has(varName)) {
        logForDebugging(
          `Hooks: env var $${varName} not in allowedEnvVars, skipping interpolation`,
          { level: 'warn' },
        )
        return ''
      }
      return process.env[varName] ?? ''
    },
  )
  return sanitizeHeaderValue(interpolated)
}

/**
 * Execute an HTTP hook by POSTing the hook input JSON to the configured URL.
 * Returns the raw response for the caller to interpret.
 *
 * Header values support $VAR_NAME and ${VAR_NAME} env var interpolation so that
 * secrets (e.g. "Authorization: Bearer $MY_TOKEN") are not stored in settings.json.
 * Only env vars explicitly listed in the hook's `allowedEnvVars` array are resolved;
 * all other references are replaced with empty strings.
 */
export async function execHttpHook(
  hook: HttpHook,
  _hookEvent: HookEvent,
  jsonInput: string,
  signal?: AbortSignal,
): Promise<{
  ok: boolean
  statusCode?: number
  body: string
  error?: string
  aborted?: boolean
}> {
  // Enforce URL allowlist before any I/O.
  // undefined → no restriction; [] → block all; non-empty → must match a pattern.
  const policy = getHttpHookPolicy()
  if (policy.allowedUrls !== undefined) {
    const matched = policy.allowedUrls.some(p => urlMatchesPattern(hook.url, p))
    if (!matched) {
      const msg = `HTTP hook blocked: ${hook.url} does not match any pattern in allowedHttpHookUrls`
      logForDebugging(msg, { level: 'warn' })
      return { ok: false, body: '', error: msg }
    }
  }

  const timeoutMs = hook.timeout
    ? hook.timeout * 1000
    : DEFAULT_HTTP_HOOK_TIMEOUT_MS

  const { signal: combinedSignal, cleanup } = createCombinedAbortSignal(
    signal,
    { timeoutMs },
  )

  try {
    // Build headers with env var interpolation in values
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (hook.headers) {
      // Intersect hook's allowedEnvVars with policy allowlist when policy is set
      const hookVars = hook.allowedEnvVars ?? []
      const effectiveVars =
        policy.allowedEnvVars !== undefined
          ? hookVars.filter(v => policy.allowedEnvVars!.includes(v))
          : hookVars
      const allowedEnvVars = new Set(effectiveVars)
      for (const [name, value] of Object.entries(hook.headers)) {
        headers[name] = interpolateEnvVars(value, allowedEnvVars)
      }
    }

    // Detect env var proxy (HTTP_PROXY / HTTPS_PROXY, respecting NO_PROXY).
    // When set, configureGlobalAgents() has already installed a request
    // interceptor that sets httpsAgent to an HttpsProxyAgent — the proxy
    // handles DNS for the target. Skip the SSRF guard in that case so we
    // don't accidentally block a corporate proxy on a private IP.
    const envProxyActive =
      getProxyUrl() !== undefined &&
      !shouldBypassProxy(hook.url)

    if (envProxyActive) {
      logForDebugging(
        `Hooks: HTTP hook POST to ${hook.url} (via env-var proxy)`,
      )
    } else {
      logForDebugging(`Hooks: HTTP hook POST to ${hook.url}`)
    }

    const response = await axios.post<string>(hook.url, jsonInput, {
      headers,
      signal: combinedSignal,
      responseType: 'text',
      validateStatus: () => true,
      maxRedirects: 0,
      // Explicit false prevents axios's own env-var proxy detection; when an
      // env-var proxy is configured, the global axios interceptor installed
      // by configureGlobalAgents() handles it via httpsAgent instead.
      proxy: false,
      // SSRF guard: validate resolved IPs and block private/link-local ranges
      // while allowing loopback for local development. Env proxies perform DNS
      // for the target, so checking the proxy's IP would block private proxies.
      lookup: envProxyActive ? undefined : ssrfGuardedLookup,
    })

    cleanup()

    const body = response.data ?? ''
    logForDebugging(
      `Hooks: HTTP hook response status ${response.status}, body length ${body.length}`,
    )

    return {
      ok: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      body,
    }
  } catch (error) {
    cleanup()

    if (combinedSignal.aborted) {
      return { ok: false, body: '', aborted: true }
    }

    const errorMsg = errorMessage(error)
    logForDebugging(`Hooks: HTTP hook error: ${errorMsg}`, { level: 'error' })
    return { ok: false, body: '', error: errorMsg }
  }
}
