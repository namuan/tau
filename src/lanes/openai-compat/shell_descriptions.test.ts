/**
 * Regression tests for shell-description rendering and per-transformer
 * schema/generation extras.
 *
 * The core invariant: tool description bytes shipped to the upstream
 * provider must be DETERMINISTIC given the model and tool.
 * Any per-call data leaking in (homedir, tmpdir, session id,
 * timestamps) would churn the upstream prompt cache every turn — the
 * exact cost regression the user asked us to avoid.
 *
 * Run:  bun run src/lanes/openai-compat/shell_descriptions.test.ts
 */

import { getCompatShellDescription } from './shell_descriptions.js'
import { moonshotTransformer } from './transformers/moonshot.js'
import { openrouterTransformer } from './transformers/openrouter.js'
import { minimaxTransformer } from './transformers/minimax.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'
import { z } from 'zod/v4'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e: any) {
    failed++
    console.log(`  FAIL ${name}: ${e?.message ?? String(e)}`)
  }
}

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint)
}

function assertEq<T>(a: T, b: T, hint: string): void {
  if (a !== b) {
    const av = String(a).slice(0, 200)
    const bv = String(b).slice(0, 200)
    throw new Error(`${hint}: expected equal\n  a=${av}\n  b=${bv}`)
  }
}

const OPENROUTER_GPT_FORBIDDEN_SCHEMA_KEYS = new Set([
  '$schema', '$id', '$ref', '$comment', '$defs', 'definitions',
  'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'title',
  'patternProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'unevaluatedProperties', 'dependentRequired', 'dependentSchemas',
  'pattern', 'format', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'prefixItems', 'unevaluatedItems', 'contains', 'minContains', 'maxContains',
  'minItems', 'maxItems', 'uniqueItems',
  'contentMediaType', 'contentEncoding',
])

function validateOpenRouterGPTSchema(node: unknown, path = '$'): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, index) => validateOpenRouterGPTSchema(item, `${path}[${index}]`))
    return
  }

  const obj = node as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    assert(!OPENROUTER_GPT_FORBIDDEN_SCHEMA_KEYS.has(key), `${path}.${key} must be stripped`)
  }

  const allowsObject = obj.type === 'object' || (Array.isArray(obj.type) && obj.type.includes('object'))
  if (allowsObject) {
    assert(obj.additionalProperties === false, `${path}.additionalProperties must be false`)
    const props = obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)
      ? obj.properties as Record<string, unknown>
      : {}
    const required = Array.isArray(obj.required) ? obj.required : []
    assert(
      JSON.stringify(required) === JSON.stringify(Object.keys(props)),
      `${path}.required must match properties; got ${JSON.stringify(required)} wanted ${JSON.stringify(Object.keys(props))}`,
    )
  }

  for (const [key, value] of Object.entries(obj)) {
    validateOpenRouterGPTSchema(value, `${path}.${key}`)
  }
}

// ─── Determinism / cache stability ──────────────────────────────

test('Bash description is byte-stable across two renders on the same input', () => {
  const ctx = { platform: 'linux' as NodeJS.Platform, psEdition: null }
  const a = getCompatShellDescription('Bash', ctx)!
  const b = getCompatShellDescription('Bash', ctx)!
  assertEq(a, b, 'two renders should produce identical bytes')
})

test('Bash description does not include process-specific data', () => {
  const ctx = { platform: 'linux' as NodeJS.Platform, psEdition: null }
  const desc = getCompatShellDescription('Bash', ctx)!
  // Things that would change per-process and bust the upstream cache:
  const homedir = process.env.HOME ?? process.env.USERPROFILE
  if (homedir && homedir.length > 0) {
    assert(!desc.includes(homedir), `Bash description should not include $HOME (${homedir})`)
  }
  assert(!desc.includes(process.cwd()), 'should not include cwd')
  assert(!/\bclaudex-\d+\b/.test(desc), 'should not include per-uid claude tmp dir')
  assert(!/[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\AppData/.test(desc), 'should not include AppData paths')
})

test('Unknown tool name returns undefined (caller falls back to original description)', () => {
  const ctx = { platform: 'linux' as NodeJS.Platform, psEdition: null }
  const desc = getCompatShellDescription('NotAShell', ctx)
  assertEq(desc, undefined, 'must be undefined so caller uses original description')
})

test('Bash description steers dev servers to tracked background tasks', () => {
  const ctx = { platform: 'linux' as NodeJS.Platform, psEdition: null }
  const desc = getCompatShellDescription('Bash', ctx)!
  assert(desc.includes('run_in_background: true'), 'should mention run_in_background')
  assert(desc.includes('echo $!'), 'should warn against pid capture')
  assert(desc.includes('docker compose up -d'), 'should warn against Docker detach')
  assert(desc.includes('& echo $!'), 'should include the raw-background anti-pattern')
})

test('Bash description uses POSIX paths', () => {
  const ctx = { platform: 'darwin' as NodeJS.Platform }
  const desc = getCompatShellDescription('Bash', ctx)!
  assert(desc.includes('Use POSIX paths'), 'should describe POSIX path syntax')
  assert(!desc.toLowerCase().includes('git bash'), 'should not mention Git Bash')
})

// ─── Moonshot schema sanitizer ──────────────────────────────────

test('Moonshot sanitizeToolSchemaExtra drops $ref siblings', () => {
  const input = {
    type: 'object',
    properties: {
      ref: { $ref: '#/$defs/X', description: 'this should go away' },
    },
  }
  const out = moonshotTransformer.sanitizeToolSchemaExtra!(input, 'kimi-k2.5')
  const props = (out.properties as Record<string, any>).ref
  assertEq(Object.keys(props).length, 1, 'only $ref should remain')
  assertEq(props.$ref, '#/$defs/X', '$ref value must be preserved')
})

test('Moonshot sanitizeToolSchemaExtra collapses tuple items to single schema', () => {
  const input = {
    type: 'array',
    items: [{ type: 'string' }, { type: 'number' }],
  }
  const out = moonshotTransformer.sanitizeToolSchemaExtra!(input, 'kimi-k2')
  assert(!Array.isArray(out.items), 'items must not be a tuple')
  assertEq((out.items as any).type, 'string', 'first schema wins')
})

// ─── OpenRouter Gemini sanitizer ────────────────────────────────

test('OpenRouter sanitizeToolSchemaExtra only fires for Gemini upstreams', () => {
  const input = {
    type: 'object',
    properties: {
      level: { type: 'integer', enum: [1, 2, 3] },
    },
  }
  // Non-Gemini → pass-through
  const passthrough = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'anthropic/claude-sonnet-4.6')
  const levelA = (passthrough.properties as Record<string, any>).level
  assertEq(levelA.type, 'integer', 'non-Gemini schema must not be rewritten')
  assert(levelA.enum.every((v: unknown) => typeof v === 'number'), 'non-Gemini enum stays numeric')

  // Gemini → rewrite integer enum → string enum
  const rewritten = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'google/gemini-2.5-pro')
  const levelB = (rewritten.properties as Record<string, any>).level
  assertEq(levelB.type, 'string', 'Gemini must rewrite integer-enum type → string')
  assert(levelB.enum.every((v: unknown) => typeof v === 'string'), 'Gemini enum values stringified')
})

test('OpenRouter Gemini sanitizer fills missing array `items`', () => {
  const input = { type: 'array' }
  const out = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'google/gemini-3-flash')
  assert(out.items !== undefined, 'items must be filled')
  assertEq((out.items as any).type, 'string', 'default item type is string')
})

test('OpenRouter Gemini sanitizer filters `required` to declared fields', () => {
  const input = {
    type: 'object',
    properties: { a: { type: 'string' } },
    required: ['a', 'b', 'c'],
  }
  const out = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'google/gemini-2.5-flash')
  assert(Array.isArray(out.required), 'required preserved')
  assertEq((out.required as string[]).length, 1, 'only declared field "a" remains')
  assertEq((out.required as string[])[0], 'a', '')
})

// ─── Default generation params ──────────────────────────────────

test('OpenRouter GPT sanitizer requires every declared object property', () => {
  const input = {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      subagent_type: { type: 'string' },
      options: {
        type: 'object',
        properties: {
          cwd: { type: 'string', minLength: 1 },
          timeout_ms: { type: 'number', minimum: 0 },
          metadata: {
            type: 'object',
            properties: {
              source: { type: 'string' },
            },
            propertyNames: { pattern: '^[a-z_]+$' },
            patternProperties: {
              '^x-': { type: 'string' },
            },
          },
        },
        required: ['cwd'],
      },
    },
    required: ['prompt'],
  }

  const out = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'openai/gpt-5.5')
  assertEq(
    JSON.stringify(out.required),
    JSON.stringify(['prompt', 'subagent_type', 'options']),
    'root required must include subagent_type',
  )
  assertEq(out.additionalProperties, false, 'root object must reject extra properties')

  // Strict mode lists every property as required, so an optional one stays
  // optional by also accepting null; required ones are left unwrapped.
  const nullable = (node: any) => {
    assert(Array.isArray(node?.anyOf) && node.anyOf.length === 2 && node.anyOf.some((n: any) => n.type === 'null'),
      `optional property must accept null: ${JSON.stringify(node)}`)
    return node.anyOf.find((n: any) => n.type !== 'null')
  }
  assertEq(JSON.stringify(nullable((out.properties as Record<string, any>).subagent_type)),
    JSON.stringify({ type: 'string' }), 'optional root property keeps its type')
  const options = nullable((out.properties as Record<string, any>).options)
  assertEq(
    JSON.stringify(options.required),
    JSON.stringify(['cwd', 'timeout_ms', 'metadata']),
    'nested required must include every nested property',
  )
  assertEq(options.additionalProperties, false, 'nested object must reject extra properties')
  assert((options.properties as Record<string, any>).cwd.minLength === undefined, 'minLength must be stripped')
  assert((options.properties as Record<string, any>).cwd.anyOf === undefined, 'a required property is not made nullable')
  assert(nullable((options.properties as Record<string, any>).timeout_ms).minimum === undefined, 'minimum must be stripped')
  const metadata = nullable((options.properties as Record<string, any>).metadata)
  assert(metadata.propertyNames === undefined, 'propertyNames must be stripped')
  assert(metadata.patternProperties === undefined, 'patternProperties must be stripped')
  assertEq(JSON.stringify(metadata.required), JSON.stringify(['source']), 'metadata required must be normalized')
  assertEq(metadata.additionalProperties, false, 'metadata object must reject extra properties')
})

test('OpenRouter GPT sanitizer does not require properties dropped by JSON serialization', () => {
  const input = {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      description: { type: 'string' },
      metadata: undefined,
    },
    required: ['subject', 'description', 'metadata'],
  }

  const out = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'openai/gpt-5.5')
  const wire = JSON.parse(JSON.stringify(out))
  assert(wire.properties.metadata === undefined, 'metadata property should not be serialized')
  assertEq(
    JSON.stringify(wire.required),
    JSON.stringify(['subject', 'description']),
    'required must only include serialized properties',
  )
})

test('OpenRouter GPT sanitizer stays scoped away from non-GPT models', () => {
  const input = {
    type: 'object',
    properties: {
      subagent_type: { type: 'string' },
    },
  }
  const out = openrouterTransformer.sanitizeToolSchemaExtra!(input, 'anthropic/claude-sonnet-4.6')
  assert(out.required === undefined, 'non-GPT OpenRouter schema must not gain required')
  assert(out.additionalProperties === undefined, 'non-GPT OpenRouter schema must not gain additionalProperties')
})

test('OpenRouter GPT sanitizer accepts task, discriminated-union, nested, and native-style schemas', () => {
  const schemas: Record<string, Record<string, unknown>> = {
    TaskCreate: zodToJsonSchema(z.strictObject({
      subject: z.string(),
      description: z.string(),
      activeForm: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })),
    SampleUnion: zodToJsonSchema(
      z.discriminatedUnion('operation', [
        z.strictObject({
          operation: z.literal('goToDefinition'),
          filePath: z.string(),
          symbol: z.string().optional(),
          line: z.number().int().positive().optional(),
          character: z.number().int().positive().optional(),
        }),
        z.strictObject({
          operation: z.literal('findReferences'),
          filePath: z.string(),
          symbol: z.string().optional(),
          line: z.number().int().positive().optional(),
          character: z.number().int().positive().optional(),
        }),
        z.strictObject({
          operation: z.literal('documentSymbol'),
          filePath: z.string(),
          symbol: z.string().optional(),
          line: z.number().int().positive().optional(),
          character: z.number().int().positive().optional(),
        }),
      ]),
    ),
    AFT: {
      type: 'object',
      properties: {
        target: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        contextLines: { type: 'integer', minimum: 1, maximum: 50 },
        options: {
          type: 'object',
          properties: { includePrivate: { type: 'boolean', default: false } },
          propertyNames: { pattern: '^[a-zA-Z]+$' },
        },
      },
    },
    Native: {
      type: 'object',
      properties: {
        repo: { type: 'string', format: 'uri-reference' },
        commits: { type: 'integer', minimum: 0, maximum: 50 },
        status: { type: 'boolean' },
      },
    },
  }

  for (const [name, schema] of Object.entries(schemas)) {
    const out = openrouterTransformer.sanitizeToolSchemaExtra!(schema, 'openai/gpt-5.5')
    validateOpenRouterGPTSchema(out, `$tools.${name}`)
  }
})

test('Moonshot defaults non-thinking Kimi to temperature 0.6', () => {
  const out = moonshotTransformer.defaultGenerationParams!('kimi-k2-turbo-preview')
  assertEq(out!.temperature, 0.6, '')
})

test('Moonshot defaults thinking Kimi to temperature 1.0', () => {
  const out = moonshotTransformer.defaultGenerationParams!('kimi-k2.5')
  assertEq(out!.temperature, 1.0, '')
  assertEq(out!.top_p, 0.95, '')
})

test('OpenRouter defaults Gemini to 1.0/0.95/64', () => {
  const out = openrouterTransformer.defaultGenerationParams!('google/gemini-2.5-pro')
  assertEq(out!.temperature, 1.0, '')
  assertEq(out!.top_p, 0.95, '')
  assertEq(out!.top_k, 64, '')
})

test('OpenRouter defaults Qwen to 0.55/1.0', () => {
  const out = openrouterTransformer.defaultGenerationParams!('qwen/qwen-3-coder-480b')
  assertEq(out!.temperature, 0.55, '')
  assertEq(out!.top_p, 1.0, '')
})

test('MiniMax defaults are 1.0/0.95/20 or 40 depending on variant', () => {
  const m2 = minimaxTransformer.defaultGenerationParams!('MiniMax-M2')
  assertEq(m2!.temperature, 1.0, '')
  assertEq(m2!.top_p, 0.95, '')
  assertEq(m2!.top_k, 20, 'M2 uses 20')

  const m25 = minimaxTransformer.defaultGenerationParams!('MiniMax-M2.5')
  assertEq(m25!.top_k, 40, 'M2.5 uses 40')
})

test('MiniMax defaults return undefined for non-MiniMax model ids', () => {
  const out = minimaxTransformer.defaultGenerationParams!('something-else')
  assertEq(out, undefined, '')
})

// ─── Cross-cutting cache invariants ─────────────────────────────

test('Shell description never contains a timestamp-shaped substring', () => {
  const ctx = { platform: 'darwin' as NodeJS.Platform }
  const desc = getCompatShellDescription('Bash', ctx)!
  assert(!/\d{4}-\d{2}-\d{2}T/.test(desc), 'timestamp leaked')
  assert(!/\b\d{10}\b/.test(desc), 'epoch leaked')
})

// ─── Summary ───────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
