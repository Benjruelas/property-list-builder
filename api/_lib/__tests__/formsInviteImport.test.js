import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('forms-invite handler module', () => {
  it('parses without SyntaxError (duplicate const regressions)', () => {
    const file = path.join(apiRoot, 'forms-invite.js')
    expect(() => execFileSync(process.execPath, ['--check', file], { encoding: 'utf8' })).not.toThrow()
  })
})
