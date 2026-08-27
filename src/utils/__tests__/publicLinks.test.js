import { describe, it, expect } from 'vitest'
import {
  buildQuotePublicUrl,
  buildReportPublicUrl,
  buildResourceSharePublicUrl,
  parsePublicRoute,
  parseReportTokenFromPublicUrl,
  parseShareTokenFromPublicUrl,
  getShareClaimTokenFromWindow,
} from '../publicLinks'

describe('publicLinks', () => {
  it('builds short quote and report URLs', () => {
    expect(buildQuotePublicUrl('Ab3xK9mP2r', 'https://app.test')).toBe('https://app.test/q/Ab3xK9mP2r')
    expect(buildReportPublicUrl('H3nQw8zK2p', 'https://app.test')).toBe('https://app.test/r/H3nQw8zK2p')
  })

  it('builds resource share URLs', () => {
    expect(buildResourceSharePublicUrl('ShareTok1234567890abcd', 'https://app.test'))
      .toBe('https://app.test/s/ShareTok1234567890abcd')
  })

  it('parses legal pages as public routes', () => {
    expect(parsePublicRoute('/terms', '')).toEqual({ type: 'terms' })
    expect(parsePublicRoute('/privacy/', '')).toEqual({ type: 'privacy' })
    expect(parsePublicRoute('/auth/google-handoff', '')).toEqual({ type: 'google-handoff' })
    expect(parsePublicRoute('/auth/google-handoff/', '?id=abc')).toEqual({ type: 'google-handoff' })
    expect(parsePublicRoute('/reset-password', '')).toEqual({ type: 'reset-password' })
  })

  it('parses short path routes', () => {
    expect(parsePublicRoute('/q/Ab3xK9mP2r', '')).toEqual({ type: 'quote', token: 'Ab3xK9mP2r' })
    expect(parsePublicRoute('/r/H3nQw8zK2p', '')).toEqual({ type: 'report', token: 'H3nQw8zK2p' })
    expect(parsePublicRoute('/s/ShareTok1234567890abcd', '')).toEqual({
      type: 'share-redirect',
      token: 'ShareTok1234567890abcd',
    })
  })

  it('does not treat ?share= as a public-only route', () => {
    expect(parsePublicRoute('/', '?share=ShareTok1234567890abcd')).toBeNull()
  })

  it('still supports legacy query param routes', () => {
    expect(parsePublicRoute('/', '?quote=legacy-token')).toEqual({ type: 'quote', token: 'legacy-token' })
    expect(parsePublicRoute('/', '?report=legacy-token')).toEqual({ type: 'report', token: 'legacy-token' })
  })

  it('parses report tokens from public URLs', () => {
    expect(parseReportTokenFromPublicUrl('https://app.test/r/0ta0xaVdQbdJY3kSIRKQHP'))
      .toBe('0ta0xaVdQbdJY3kSIRKQHP')
  })

  it('parses share tokens from public URLs', () => {
    expect(parseShareTokenFromPublicUrl('https://app.test/s/ShareTok1234567890abcd'))
      .toBe('ShareTok1234567890abcd')
  })

  it('returns empty share claim token when window is unavailable', () => {
    expect(getShareClaimTokenFromWindow()).toBe('')
  })
})
