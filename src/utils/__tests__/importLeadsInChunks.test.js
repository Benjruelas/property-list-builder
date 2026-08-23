import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importLeadsInChunks } from '../leads'

function mockLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('importLeadsInChunks', () => {
  beforeEach(() => {
    mockLocalStorage()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('chunks requests and remaps per-batch error indexes', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          created: body.leads.slice(0, -1).map((lead, i) => ({ ...lead, id: `lead_${i}` })),
          errors: [{ index: body.leads.length - 1, message: 'nope' }],
          rateLimit: { remaining: 1000, limit: 2000, retryAfter: 0 },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const leads = Array.from({ length: 52 }, (_, i) => ({ firstName: `N${i}` }))
    const result = await importLeadsInChunks(async () => 'token', leads)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.created).toHaveLength(50)
    expect(result.errors).toEqual([
      { index: 49, message: 'nope' },
      { index: 51, message: 'nope' },
    ])
  })

  it('automatically retries after a 429 and finishes the import', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetchMock = vi.fn(async (_url, init) => {
      calls += 1
      const body = JSON.parse(init.body)
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null },
          json: async () => ({
            error: 'Import limit reached for this hour. Please wait and retry.',
            retryAfter: 2,
            rateLimit: { remaining: 0, limit: 2000, retryAfter: 2 },
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          created: body.leads.map((lead, i) => ({ ...lead, id: `lead_${i}` })),
          errors: [],
          rateLimit: { remaining: 1999, limit: 2000, retryAfter: 0 },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = importLeadsInChunks(async () => 'token', [{ firstName: 'Ada' }], {}, {
      onRateLimitWait: vi.fn(),
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.created).toHaveLength(1)
    vi.useRealTimers()
  })

  it('uses a smaller batch when remaining quota is below the default batch size', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          created: body.leads.map((lead, i) => ({ ...lead, id: `lead_${i}` })),
          errors: [],
          rateLimit: { remaining: 10, limit: 2000, retryAfter: 0 },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const leads = Array.from({ length: 55 }, (_, i) => ({ firstName: `N${i}` }))
    await importLeadsInChunks(async () => 'token', leads)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).leads).toHaveLength(50)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).leads).toHaveLength(5)
  })

  it('requires sign-in', async () => {
    await expect(importLeadsInChunks(async () => null, [{ firstName: 'Ada' }]))
      .rejects.toThrow(/Sign in/)
  })

  it('forwards the chosen sharing rule on each batch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ created: [{ id: 'lead_1', firstName: 'Ada' }], errors: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await importLeadsInChunks(
      async () => 'token',
      [{ firstName: 'Ada' }],
      { visibility: 'members', sharedMemberUids: ['u2'], sharedWith: ['pat@example.com'] },
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.visibility).toBe('members')
    expect(body.sharedMemberUids).toEqual(['u2'])
    expect(body.sharedWith).toEqual(['pat@example.com'])
  })
})
