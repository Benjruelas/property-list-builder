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
  })

  it('chunks requests and remaps per-batch error indexes', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          created: body.leads.slice(0, -1).map((lead, i) => ({ ...lead, id: `lead_${i}` })),
          errors: [{ index: body.leads.length - 1, message: 'nope' }],
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

  it('requires sign-in', async () => {
    await expect(importLeadsInChunks(async () => null, [{ firstName: 'Ada' }]))
      .rejects.toThrow(/Sign in/)
  })
})
