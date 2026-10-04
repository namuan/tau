import { getUnsupportedPlatformMessage } from './platformSupport.js'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL ${name}: ${(error as Error).message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}`)
  }
}

test('macOS is supported', () => {
  assertEqual(getUnsupportedPlatformMessage('darwin'), null)
})

test('Linux including WSL is unsupported', () => {
  const message = getUnsupportedPlatformMessage('linux')
  assertEqual(message?.includes('Linux, WSL'), true)
})

test('Windows is unsupported', () => {
  const message = getUnsupportedPlatformMessage('win32')
  assertEqual(message?.includes('Windows are not supported'), true)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
