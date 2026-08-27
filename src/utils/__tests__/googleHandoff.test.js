import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createHandoffSecrets,
  createPkcePair,
  buildGooglePkceAuthUrl,
  googleOAuthRedirectUri,
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

  it('builds PKCE S256 pairs', () => {
    const one = createPkcePair()
    const two = createPkcePair()
    expect(one.verifier).toBeTruthy()
    expect(one.challenge).toBeTruthy()
    expect(one.verifier).not.toBe(one.challenge)
    expect(one.verifier).not.toBe(two.verifier)
  })

  it('builds Google auth URL with PKCE params', () => {
    const url = buildGooglePkceAuthUrl({
      clientId: 'client.apps.googleusercontent.com',
      redirectUri: 'https://knockscout.app/api/auth-google-oauth-callback',
      state: 'abc123',
      codeChallenge: 'challenge',
    })
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
    const u = new URL(url)
    expect(u.searchParams.get('client_id')).toBe('client.apps.googleusercontent.com')
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://knockscout.app/api/auth-google-oauth-callback',
    )
    expect(u.searchParams.get('state')).toBe('abc123')
    expect(u.searchParams.get('code_challenge')).toBe('challenge')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('response_type')).toBe('code')
  })

  it('builds oauth callback redirect URI', () => {
    expect(googleOAuthRedirectUri('https://knockscout.app')).toBe(
      'https://knockscout.app/api/auth-google-oauth-callback',
    )
  })
})

describe('googleHandoff client utils', () => {
  let sessionStore
  let localStore

  beforeEach(() => {
    sessionStore = new Map()
    localStore = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
      setItem: (k, v) => { sessionStore.set(k, String(v)) },
      removeItem: (k) => { sessionStore.delete(k) },
      clear: () => { sessionStore.clear() },
    })
    vi.stubGlobal('localStorage', {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => { localStore.set(k, String(v)) },
      removeItem: (k) => { localStore.delete(k) },
      clear: () => { localStore.clear() },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores and clears handoff session in session + local storage', async () => {
    const {
      storeHandoff,
      readStoredHandoff,
      clearStoredHandoff,
      buildHandoffSafariUrl,
    } = await import('../../utils/googleHandoff.js')

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=hid'
    storeHandoff({
      handoffId: 'hid',
      pollToken: 'pt',
      startedAt: 123,
      safariUrl: authUrl,
    })
    expect(readStoredHandoff()).toEqual({
      handoffId: 'hid',
      pollToken: 'pt',
      startedAt: 123,
      safariUrl: authUrl,
    })
    expect(localStore.get('knockscout.googleHandoff.v1')).toContain('accounts.google.com')
    expect(buildHandoffSafariUrl('hid', 'https://knockscout.app')).toBe(
      'https://knockscout.app/auth/google-handoff?id=hid',
    )
    clearStoredHandoff()
    expect(readStoredHandoff()).toBeNull()
    expect(localStore.has('knockscout.googleHandoff.v1')).toBe(false)
  })
})
