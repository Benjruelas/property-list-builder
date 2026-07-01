import { describe, it, expect } from 'vitest'
import {
  buildQuotePublicUrl,
  buildReportPublicUrl,
  parsePublicRoute,
} from '../publicLinks'

describe('publicLinks', () => {
  it('builds short quote and report URLs', () => {
    expect(buildQuotePublicUrl('Ab3xK9mP2r', 'https://app.test')).toBe('https://app.test/q/Ab3xK9mP2r')
    expect(buildReportPublicUrl('H3nQw8zK2p', 'https://app.test')).toBe('https://app.test/r/H3nQw8zK2p')
  })

  it('parses short path routes', () => {
    expect(parsePublicRoute('/q/Ab3xK9mP2r', '')).toEqual({ type: 'quote', token: 'Ab3xK9mP2r' })
    expect(parsePublicRoute('/r/H3nQw8zK2p', '')).toEqual({ type: 'report', token: 'H3nQw8zK2p' })
  })

  it('still supports legacy query param routes', () => {
    expect(parsePublicRoute('/', '?quote=legacy-token')).toEqual({ type: 'quote', token: 'legacy-token' })
    expect(parsePublicRoute('/', '?report=legacy-token')).toEqual({ type: 'report', token: 'legacy-token' })
  })
})
