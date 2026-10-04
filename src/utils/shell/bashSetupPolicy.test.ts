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

test('old system bash does not trigger setup on macOS', () => {
  assertEqual(shouldPromptForBashSetup(status(), notAcknowledged, 'darwin'), false)
})

test('old system bash does not trigger setup on Linux', () => {
  assertEqual(shouldPromptForBashSetup(status(), notAcknowledged, 'linux'), false)
})

test('Git Bash does not trigger setup on Windows', () => {
  assertEqual(
    shouldPromptForBashSetup(status({ source: 'git-for-windows' }), notAcknowledged, 'win32'),
    false,
  )
})

test('missing bash triggers setup on Unix', () => {
  const missingBash = status({ ok: false, path: null, source: null })
  assertEqual(shouldPromptForBashSetup(missingBash, notAcknowledged, 'darwin'), true)
})

test('WSL bash triggers setup on Windows', () => {
  assertEqual(
    shouldPromptForBashSetup(status({ source: 'wsl', path: 'wsl.exe' }), notAcknowledged, 'win32'),
    true,
  )
})

test('generic system bash triggers setup on Windows', () => {
  assertEqual(shouldPromptForBashSetup(status(), notAcknowledged, 'win32'), true)
})

test('an acknowledged missing shell does not prompt again', () => {
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
