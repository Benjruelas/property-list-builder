import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('../kvBootstrap.js', () => ({
  kvAvailable: true,
  kv: {
    set: async (key, value, opts = {}) => {
      if (opts.nx && store.has(key)) return null
      store.set(key, value)
      return 'OK'
    },
    get: async (key) => store.get(key) ?? null,
  },
}))

import {
  beginIdempotent,
  finishIdempotent,
  readIdempotencyKey,
  getIdempotentResponse,
} from '../idempotency.js'

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return res
}

describe('idempotency helpers', () => {
  beforeEach(() => {
    store.clear()
  })

  it('reads Idempotency-Key header case-insensitively', () => {
    expect(readIdempotencyKey({ headers: { 'idempotency-key': 'abc' } })).toBe('abc')
    expect(readIdempotencyKey({ headers: { 'Idempotency-Key': 'xyz' } })).toBe('xyz')
    expect(readIdempotencyKey({ headers: {} })).toBe(null)
  })

  it('replays stored responses on second claim', async () => {
    const req = { headers: { 'idempotency-key': 'k-1' } }
    const res1 = mockRes()
    const first = await beginIdempotent(req, res1, 'paths')
    expect(first.replay).toBe(false)
    await finishIdempotent(first.key, 201, { path: { id: 'p1' } })

    const res2 = mockRes()
    const second = await beginIdempotent(req, res2, 'paths')
    expect(second.replay).toBe(true)
    expect(res2.statusCode).toBe(201)
    expect(res2.body).toEqual({ path: { id: 'p1' } })
  })

  it('stores and retrieves response payloads', async () => {
    await finishIdempotent('paths:abc', 200, { ok: true })
    const cached = await getIdempotentResponse('paths:abc')
    expect(cached).toEqual({ status: 200, body: { ok: true } })
  })
})
