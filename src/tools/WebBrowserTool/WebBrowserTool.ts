import { createElement } from 'react'
import { readFileSync } from 'fs'
import { z } from 'zod/v4'

import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { openBrowser, openPath } from '../../utils/browser.js'
import { resolveLocalFileTarget } from '../../utils/fileUrls.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { WEB_BROWSER_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Open an http(s) URL, local file path, or file:// URL in the native browser, or capture a compact HTTP/local HTML snapshot.'

const PROMPT = `Use the native browser bridge for browser-adjacent verification.

Actions:
- open: open an http(s) URL in the user's default browser, or a local file path/file:// URL with the OS file handler.
- snapshot: fetch an http(s) URL or read a local HTML file path/file:// URL and return a compact page snapshot: status, title, headings, links, forms, and optional text search.

For local artifacts, prefer passing the absolute path returned by the artifact tool, or its canonical fileUrl/htmlUrl if provided. Do not synthesize relative file URLs such as file://.tau/artifacts/x.html; if one is passed anyway, WebBrowser resolves it from the current workspace and reports the canonical file:/// URL.

This tool is dependency-free and does not click, type, run page JavaScript, read console logs, or take screenshots. Interactive browser automation requires a separate browser automation environment.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['open', 'snapshot']).describe('Browser action to perform.'),
    url: z.string().min(1).describe('HTTP/HTTPS URL, file URL, or local file path.'),
    findText: z
      .string()
      .optional()
      .describe('Optional text to search for in the fetched HTML snapshot.'),
    maxTextChars: z
      .number()
      .int()
      .min(500)
      .max(12000)
      .optional()
      .describe('Maximum extracted text characters to return for snapshot. Defaults to 4000.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const linkSchema = z.object({
  text: z.string(),
  href: z.string(),
})

const outputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['open', 'snapshot']),
    url: z.string(),
    opened: z.boolean().optional(),
    status: z.number().optional(),
    ok: z.boolean().optional(),
    title: z.string().optional(),
    headings: z.array(z.string()).optional(),
    links: z.array(linkSchema).optional(),
    forms: z.number().optional(),
    findTextFound: z.boolean().optional(),
    text: z.string().optional(),
    warnings: z.array(z.string()),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

function renderText(message: string): React.ReactNode {
  return createElement(Text, null, message)
}

function stripTags(text: string): string {
  return text
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function firstMatch(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern)
  const value = match?.[1]
  return value ? decodeBasicEntities(stripTags(value)) : undefined
}

function allMatches(html: string, pattern: RegExp, limit: number): string[] {
  return [...html.matchAll(pattern)]
    .map(match => decodeBasicEntities(stripTags(match[1] ?? '')))
    .filter(Boolean)
    .slice(0, limit)
}

function extractLinks(base: URL, html: string): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = []
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const rawHref = match[1]
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
      continue
    }
    try {
      const href = new URL(rawHref, base).toString()
      const text = decodeBasicEntities(stripTags(match[2] ?? '')).slice(0, 100)
      links.push({ text: text || href, href })
    } catch {
      // Skip malformed links.
    }
    if (links.length >= 20) break
  }
  return links
}

function extractBodyText(html: string, maxChars: number): string {
  const body = firstMatch(html, /<body[^>]*>([\s\S]*?)<\/body>/i) ?? stripTags(html)
  return body.length > maxChars ? `${body.slice(0, maxChars)}...` : body
}

function unsupportedUrlMessage(): string {
  return 'WebBrowser only supports http://, https://, file://, and local file paths'
}

function looksLikeWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value)
}

type BrowserTarget =
  | { kind: 'web'; url: string; parsed: URL }
  | { kind: 'file'; path: string; url: string }

function resolveBrowserTarget(input: string): BrowserTarget {
  const trimmed = input.trim()

  if (!looksLikeWindowsDrivePath(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { kind: 'web', url: parsed.toString(), parsed }
      }
      if (parsed.protocol === 'file:') {
        return { kind: 'file', ...resolveLocalFileTarget(trimmed) }
      }
      throw new Error(unsupportedUrlMessage())
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === unsupportedUrlMessage()
      ) {
        throw error
      }
    }
  }

  return { kind: 'file', ...resolveLocalFileTarget(trimmed) }
}

export const WebBrowserTool = buildTool({
  name: WEB_BROWSER_TOOL_NAME,
  searchHint: 'native browser open snapshot local file html artifact',
  maxResultSizeChars: 80_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Using browser'
  },
  isReadOnly(input) {
    return input.action === 'snapshot'
  },
  isConcurrencySafe() {
    return true
  },
  isDestructive() {
    return false
  },
  toAutoClassifierInput(input) {
    return `${input.action} ${input.url}`.trim()
  },
  async validateInput(input) {
    try {
      resolveBrowserTarget(input.url)
    } catch (error) {
      return {
        result: false,
        message:
          error instanceof Error
            ? error.message
            : 'WebBrowser requires a valid URL or local file path',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage(input) {
    return renderText(`${input.action ?? 'browser'} ${input.url ?? ''}`.trim())
  },
  renderToolResultMessage(output) {
    if (output.action === 'open') {
      return renderText(output.opened ? `Opened ${output.url}` : `Could not open ${output.url}`)
    }
    return renderText(`${output.status ?? '?'} ${output.title ?? output.url}`)
  },
  async call(input, ctx) {
    let target: BrowserTarget
    try {
      target = resolveBrowserTarget(input.url)
    } catch (error) {
      return {
        data: {
          action: input.action,
          url: input.url,
          ...(input.action === 'open'
            ? { opened: false }
            : { status: 0, ok: false }),
          warnings: [
            error instanceof Error
              ? `Could not resolve browser target: ${error.message}`
              : 'Could not resolve browser target.',
          ],
        },
      }
    }

    if (input.action === 'open') {
      if (target.kind === 'file') {
        const opened = await openPath(target.path)
        return {
          data: {
            action: input.action,
            url: target.url,
            opened,
            warnings: opened ? [] : ['The OS browser command failed. Open the URL manually if needed.'],
          },
        }
      }

      const opened = await openBrowser(target.url)
      return {
        data: {
          action: input.action,
          url: target.url,
          opened,
          warnings: opened ? [] : ['The OS browser command failed. Open the URL manually if needed.'],
        },
      }
    }

    let html: string
    let status = 200
    let ok = true
    let warnings: string[] = []

    if (target.kind === 'file') {
      try {
        html = readFileSync(target.path, 'utf8')
        input = { ...input, url: target.url }
      } catch (error) {
        return {
          data: {
            action: input.action,
            url: target.url,
            status: 0,
            ok: false,
            warnings: [
              error instanceof Error
                ? `Could not read local file: ${error.message}`
                : 'Could not read local file.',
            ],
          },
        }
      }
    } else {
      const response = await fetch(target.url, { signal: ctx.abortController.signal })
      html = await response.text()
      status = response.status
      ok = response.ok
      warnings = []
      input = { ...input, url: target.url }
    }

    const base = new URL(input.url)
    const findTextFound = input.findText
      ? html.toLowerCase().includes(input.findText.toLowerCase())
      : undefined

    return {
      data: {
        action: input.action,
        url: input.url,
        status,
        ok,
        title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
        headings: allMatches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 12),
        links: extractLinks(base, html),
        forms: [...html.matchAll(/<form\b/gi)].length,
        ...(findTextFound !== undefined ? { findTextFound } : {}),
        text: extractBodyText(html, input.maxTextChars ?? 4000),
        warnings,
      },
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const lines =
      output.action === 'open'
        ? [
            `Action: open`,
            `URL: ${output.url}`,
            `Opened: ${output.opened ? 'yes' : 'no'}`,
            ...output.warnings.map(w => `Warning: ${w}`),
          ]
        : [
            `Action: snapshot`,
            `URL: ${output.url}`,
            `Status: ${output.status} ${output.ok ? 'OK' : 'FAILED'}`,
            ...(output.title ? [`Title: ${output.title}`] : []),
            ...(output.findTextFound !== undefined
              ? [`Find text: ${output.findTextFound ? 'found' : 'not found'}`]
              : []),
            `Forms: ${output.forms ?? 0}`,
            '',
            'Headings:',
            ...(output.headings?.length ? output.headings.map(h => `- ${h}`) : ['- none']),
            '',
            'Links:',
            ...(output.links?.length
              ? output.links.map(l => `- ${l.text}: ${l.href}`)
              : ['- none']),
            ...(output.text ? ['', 'Text:', output.text] : []),
            ...(output.warnings.length ? ['', 'Warnings:', ...output.warnings.map(w => `- ${w}`)] : []),
          ]
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: lines.join('\n'),
      is_error: output.ok === false || output.opened === false ? true : undefined,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
