import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

test('Node runtime can parse YAML frontmatter', () => {
  const yaml = require('yaml')
  assert.deepEqual(yaml.parse('name: sample\ndescription: test'), {
    name: 'sample',
    description: 'test',
  })
})
