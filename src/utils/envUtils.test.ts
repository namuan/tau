import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { homedir } from 'os'
import { join } from 'path'
import { getTauConfigHomeDir } from './envUtils.js'

test('Tau config dir uses the Tau override', () => {
  const previous = process.env.TAU_CONFIG_DIR
  process.env.TAU_CONFIG_DIR = join(homedir(), 'tau-config-test')
  try {
    assert.equal(getTauConfigHomeDir(), process.env.TAU_CONFIG_DIR)
  } finally {
    if (previous === undefined) delete process.env.TAU_CONFIG_DIR
    else process.env.TAU_CONFIG_DIR = previous
  }
})

test('Tau config dir ignores the Claude config override', () => {
  const previousTau = process.env.TAU_CONFIG_DIR
  const previousClaude = process.env.CLAUDE_CONFIG_DIR
  delete process.env.TAU_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = join(homedir(), 'claude-config-test')
  try {
    assert.equal(getTauConfigHomeDir(), join(homedir(), '.config', 'tau'))
  } finally {
    if (previousTau === undefined) delete process.env.TAU_CONFIG_DIR
    else process.env.TAU_CONFIG_DIR = previousTau
    if (previousClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousClaude
  }
})
