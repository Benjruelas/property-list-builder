import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { flags } from '../flags.js'

describe('flags', () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  it('defaults infra flags to off', () => {
    delete process.env.FLAG_AUTH_CACHE
    delete process.env.FLAG_LEADS_LOCK
    delete process.env.FLAG_VERSIONED_POLL
    delete process.env.FLAG_LEADS_SHARDED
    expect(flags.AUTH_CACHE()).toBe(false)
    expect(flags.LEADS_LOCK()).toBe(false)
    expect(flags.VERSIONED_POLL()).toBe(false)
    expect(flags.LEADS_SHARDED()).toBe('off')
  })

  it('reads on/shadow shard modes', () => {
    process.env.FLAG_LEADS_SHARDED = 'shadow'
    expect(flags.LEADS_SHARDED()).toBe('shadow')
    process.env.FLAG_LEADS_SHARDED = 'on'
    expect(flags.LEADS_SHARDED()).toBe('on')
  })
})
