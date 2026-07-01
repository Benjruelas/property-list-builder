import { describe, it, expect } from 'vitest'
import {
  generatePublicInviteToken,
  buildQuotePublicUrl,
  buildReportPublicUrl,
  buildQuotePublicPath,
} from '../publicLinks.js'

describe('publicLinks', () => {
  it('generates compact invite tokens', () => {
    const token = generatePublicInviteToken()
    expect(token).toHaveLength(10)
    expect(token).toMatch(/^[0-9A-Za-z]+$/)
  })

  it('builds short public URLs', () => {
    expect(buildQuotePublicUrl('https://app.test', 'Ab3xK9mP2r')).toBe('https://app.test/q/Ab3xK9mP2r')
    expect(buildReportPublicUrl('https://app.test', 'H3nQw8zK2p')).toBe('https://app.test/r/H3nQw8zK2p')
  })

  it('builds quote paths with payment query params', () => {
    expect(buildQuotePublicPath('Ab3xK9mP2r', { payment: 'success' })).toBe('/q/Ab3xK9mP2r?payment=success')
  })
})
