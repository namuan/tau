import { isClipboardImageSupported, looksLikeImageBuffer } from './clipboardImage.js'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL ${name}: ${String(error)}`)
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function imageBuffer(header: number[] | string): Buffer {
  return Buffer.concat([
    typeof header === 'string' ? Buffer.from(header) : Buffer.from(header),
    Buffer.alloc(16),
  ])
}

async function main(): Promise<void> {
  console.log('clipboardImage')

  await test('recognizes supported image formats', () => {
    assert(looksLikeImageBuffer(imageBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG')
    assert(looksLikeImageBuffer(imageBuffer([0xff, 0xd8, 0xff])), 'JPEG')
    assert(looksLikeImageBuffer(imageBuffer('GIF89a')), 'GIF')
    assert(looksLikeImageBuffer(imageBuffer('BM')), 'BMP')
    assert(looksLikeImageBuffer(imageBuffer('RIFF1234WEBP')), 'WEBP')
  })

  await test('rejects empty, truncated, and unrecognized data', () => {
    assert(!looksLikeImageBuffer(Buffer.alloc(0)), 'empty file')
    assert(!looksLikeImageBuffer(Buffer.from('Error: target not available')), 'error text')
    assert(!looksLikeImageBuffer(Buffer.from([0x89, 0x50])), 'truncated header')
  })

  await test('clipboard image support is available on the supported platform', () => {
    assert(isClipboardImageSupported(), 'macOS clipboard support should be enabled')
  })

  await test('uses Tau-owned platform-independent paths', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(
      fileURLToPath(new URL('./clipboardImage.ts', import.meta.url)),
      'utf8',
    )
    assert(!source.includes('CLAUDE_CODE_TMPDIR'), 'must not use Claude-owned paths')
    assert(!source.includes('powershell'), 'must not invoke PowerShell')
    assert(!/['"`]\/(home|Users)\//.test(source), 'no user-specific paths')
  })

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`)
    process.exitCode = 1
  } else {
    console.log(`\n${passed} passed`)
  }
}

void main()
