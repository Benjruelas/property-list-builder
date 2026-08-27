import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createHandoffSecrets,
  hashPollToken,
  handoffKvKey,
  safeEqualHex,
} from '../../../api/_lib/googleHandoff.js'

describe('googleHandoff helpers', () => {
  it('builds stable kv keys', () => {
    expect(handoffKvKey('abc')).toBe('auth:google-handoff:abc')
  })

  it('hashes poll tokens deterministically', () => {
    expect(hashPollToken('token-a')).toBe(hashPollToken('token-a'))
    expect(hashPollToken('token-a')).not.toBe(hashPollToken('token-b'))
  })

  it('compares hex hashes safely', () => {
    const a = hashPollToken('same')
    const b = hashPollToken('same')
    const c = hashPollToken('other')
    expect(safeEqualHex(a, b)).toBe(true)
    expect(safeEqualHex(a, c)).toBe(false)
    expect(safeEqualHex(a, a.slice(0, -1))).toBe(false)
  })

  it('creates unique handoff secrets', () => {
    const one = createHandoffSecrets()
    const two = createHandoffSecrets()
    expect(one.handoffId).toHaveLength(32)
    expect(one.pollToken).toBeTruthy()
    expect(one.pollTokenHash).toBe(hashPollToken(one.pollToken))
    expect(one.handoffId).not.toBe(two.handoffId)
    expect(one.pollToken).not.toBe(two.pollToken)
  })
})

describe('googleHandoff client utils', () => {
  let store

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
      clear: () => { store.clear() },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores and clears handoff session', async () => {
    const {
      storeHandoff,
      readStoredHandoff,
      clearStoredHandoff,
      buildHandoffSafariUrl,
    } = await import('../../utils/googleHandoff.js')

    storeHandoff({ handoffId: 'hid', pollToken: 'pt', startedAt: 123, safariUrl: 'https://knockscout.app/auth/google-handoff?id=hid' })
    expect(readStoredHandoff()).toEqual({
      handoffId: 'hid',
      pollToken: 'pt',
      startedAt: 123,
      safariUrl: 'https://knockscout.app/auth/google-handoff?id=hid',
    })
    expect(buildHandoffSafariUrl('hid', 'https://knockscout.app')).toBe(
      'https://knockscout.app/auth/google-handoff?id=hid',
    )
    clearStoredHandoff()
    expect(readStoredHandoff()).toBeNull()
  })
})
