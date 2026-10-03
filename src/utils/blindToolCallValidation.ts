import type { Tool } from '../Tool.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

/**
 * A "blind" call is a tool_use produced by a request that did not carry the
 * tool's parameter schema. Blocking those calls outright cost a full turn and
 * surfaced an internal recovery error, so instead they are checked against the
 * schema Tau already holds locally: a call that matches the real schema is
 * indistinguishable from an informed one and runs immediately, while a call
 * carrying invented parameters is rejected the same way any malformed call is.
 *
 * Only the checks the normal validation path cannot make are done here.
 * Required fields and value types are already enforced by the tool's Zod
 * schema; what Zod deliberately does NOT do is reject unknown properties
 * (`.strip()` silently drops them, which is how a guessed parameter would
 * become a silent behavior change).
 */
export type BlindCallCheck = { ok: true } | { ok: false; message: string }

function getDeclaredSchema(tool: Tool): Record<string, unknown> | null {
  if (tool.inputJSONSchema) {
    return tool.inputJSONSchema as unknown as Record<string, unknown>
  }
  try {
    return zodToJsonSchema(tool.inputSchema) as Record<string, unknown>
  } catch {
    return null
  }
}

export function resetBlindCallValidatorCache(): void {}

function summarizeJsonSchema(schema: Record<string, unknown>): string | null {
  const properties = schema.properties
  if (!properties || typeof properties !== 'object') return null
  try {
    const summary: Record<string, unknown> = { type: 'object', properties }
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      summary.required = schema.required
    }
    const text = JSON.stringify(summary, null, 2)
    return text.length > 1500 ? `${text.slice(0, 1500)}\n… (truncated)` : text
  } catch {
    return null
  }
}

function withSchema(
  schema: Record<string, unknown>,
  message: string,
): BlindCallCheck {
  const summary = summarizeJsonSchema(schema)
  return {
    ok: false,
    message: summary ? `${message}\nExpected input schema:\n${summary}` : message,
  }
}

/**
 * Decide whether a blind deferred call may run as sent.
 *
 * `input` must already be coerced by `coerceToolInput`, so near-miss key
 * spellings and stringified scalars are treated exactly as the normal
 * execution path would treat them.
 */
export function checkBlindDeferredCallInput(
  tool: Tool,
  input: unknown,
): BlindCallCheck {
  const schema = getDeclaredSchema(tool)
  if (!schema) {
    return { ok: true }
  }

  const record =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}

  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : null

  if (properties) {
    const invented = Object.keys(record).filter(key => !(key in properties))
    if (invented.length > 0) {
      return withSchema(
        schema,
        `${tool.name} was called with ${invented.length === 1 ? 'a parameter' : 'parameters'} that its schema does not define: ` +
          `${invented.map(key => `\`${key}\``).join(', ')}. ` +
          `This call was produced before ${tool.name}'s schema was declared, so unrecognized parameters are rejected instead of ignored. ` +
          `Re-send the call using only the fields below.`,
      )
    }
  }

  return { ok: true }
}
