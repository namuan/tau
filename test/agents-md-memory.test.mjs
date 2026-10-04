import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const distPath = resolve('dist/tau.mjs')
const harnessPath = join(
  dirname(distPath),
  `.agents-md-harness-${process.pid}-${Date.now()}.mjs`,
)
let source = readFileSync(distPath, 'utf8')
source = source.replace(/\nvoid main\d*\(\);\r?\n/, '\n')
source += `
export function __memory() {
  init_claudemd();
  return { getMemoryFiles };
}
`
writeFileSync(harnessPath, source)

function loadMemory(repoDir) {
  const script = `
    process.env.TAU_CONFIG_DIR = ${JSON.stringify(join(repoDir, '.cfg'))};
    process.chdir(${JSON.stringify(repoDir)});
    const m = await import(${JSON.stringify(new URL(`file:///${harnessPath.replaceAll('\\', '/')}`).href)});
    const files = await m.__memory().getMemoryFiles();
    const rel = p => p.split(/[\\\\/]/).pop();
    console.log('@@' + JSON.stringify(files.map(f => ({ name: rel(f.path), content: f.content }))));
  `
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: repoDir,
    timeout: 120_000,
  })
  const line = out.split('\n').find(l => l.startsWith('@@'))
  assert.ok(line, `child produced no result. output:\n${out}`)
  return JSON.parse(line.slice(2))
}

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tau-agents-md-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  mkdirSync(join(dir, '.cfg'), { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  created.push(dir)
  return dir
}

const created = []

test.after(() => {
  try {
    unlinkSync(harnessPath)
  } catch {}
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('AGENTS.md is loaded as project memory', () => {
  const files = loadMemory(repo({ 'AGENTS.md': '# Payments\npnpm only\n' }))
  assert.deepEqual(files.map(file => file.name), ['AGENTS.md'])
  assert.match(files[0].content, /pnpm only/)
})

test('CLAUDE.md is ignored when AGENTS.md is present', () => {
  const files = loadMemory(
    repo({
      'AGENTS.md': 'tau instructions\n',
      'CLAUDE.md': 'legacy instructions\n',
    }),
  )
  assert.deepEqual(files.map(file => file.name), ['AGENTS.md'])
  assert.doesNotMatch(files[0].content, /legacy instructions/)
})

test('CLAUDE.md is ignored when no AGENTS.md is present', () => {
  assert.deepEqual(
    loadMemory(repo({ 'CLAUDE.md': 'legacy instructions\n' })),
    [],
  )
})

test('nested AGENTS.md files load from parent to child', () => {
  const dir = repo({
    'AGENTS.md': 'root instructions\n',
    'sub/AGENTS.md': 'subdirectory instructions\n',
  })
  const files = loadMemory(join(dir, 'sub'))
  assert.deepEqual(files.map(file => file.name), ['AGENTS.md', 'AGENTS.md'])
  assert.match(files[0].content, /root instructions/)
  assert.match(files[1].content, /subdirectory instructions/)
})

test('Claude-specific instruction paths are ignored', () => {
  const files = loadMemory(
    repo({
      '.claude/CLAUDE.md': 'nested legacy instructions\n',
      '.claude/rules/style.md': 'legacy rule\n',
      'CLAUDE.local.md': 'private legacy instructions\n',
    }),
  )
  assert.deepEqual(files, [])
})

test('an AGENTS.md directory is not loaded as a file', () => {
  const dir = repo({})
  mkdirSync(join(dir, 'AGENTS.md'), { recursive: true })
  assert.deepEqual(loadMemory(dir), [])
})
