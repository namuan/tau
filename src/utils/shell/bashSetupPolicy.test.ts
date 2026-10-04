import { shouldPromptForBashSetup } from './bashSetupPolicy.js'
import type { BashStatus } from './bashAvailability.js'

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

function status(overrides: Partial<BashStatus> = {}): BashStatus {
  return {
    ok: true,
    path: '/bin/bash',
    versionLine: 'GNU bash, version 3.2.57(1)-release',
    source: 'system',
    ...overrides,
  }
}

const notAcknowledged = { alreadyAcknowledged: false, resetRequested: false }

test('old Bash does not trigger setup on macOS', () => {
  assertEqual(shouldPromptForBashSetup(status(), notAcknowledged, 'darwin'), false)
})

test('missing Bash triggers setup on macOS', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(shouldPromptForBashSetup(missingBash, notAcknowledged, 'darwin'), true)
})

test('an acknowledged missing Bash does not prompt again', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(
    shouldPromptForBashSetup(
      missingBash,
      { alreadyAcknowledged: true, resetRequested: false },
      'darwin',
    ),
    false,
  )
})

test('the reset option shows the setup prompt again', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(
    shouldPromptForBashSetup(
      missingBash,
      { alreadyAcknowledged: true, resetRequested: true },
      'darwin',
    ),
    true,
  )
})

test('Linux does not run Bash setup', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(shouldPromptForBashSetup(missingBash, notAcknowledged, 'linux'), false)
})

test('Windows does not run Bash setup', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(shouldPromptForBashSetup(missingBash, notAcknowledged, 'win32'), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
