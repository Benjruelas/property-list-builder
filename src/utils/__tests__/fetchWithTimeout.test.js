import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from '../fetchWithTimeout'

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns the fetch response when it resolves in time', async () => {
    const response = { ok: true, status: 200 }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))

    await expect(fetchWithTimeout('/api/ok', { timeoutMs: 5_000 })).resolves.toBe(response)
  })

  it('throws TimeoutError when the request hangs past timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })))

    const pending = fetchWithTimeout('/api/hang', { timeoutMs: 2_000 })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(2_000)
    await assertion
  })

  it('aborts when the outer signal aborts', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })))

    const outer = new AbortController()
    const pending = fetchWithTimeout('/api/hang', { timeoutMs: 10_000, signal: outer.signal })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    outer.abort()
    await assertion
  })
})
