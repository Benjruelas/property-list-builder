import { describe, it, expect } from 'vitest'
import {
  parsePhoneDigits,
  formatPhoneUS,
  normalizePhoneForStorage,
  normalizePhoneForTel,
  phoneMatchesQuery,
} from '../phoneFormat'

describe('phoneFormat', () => {
  it('parsePhoneDigits strips non-digits and leading country code', () => {
    expect(parsePhoneDigits('(817) 555-1234')).toBe('8175551234')
    expect(parsePhoneDigits('1-817-555-1234')).toBe('8175551234')
    expect(parsePhoneDigits('817.555.1234 ext 99')).toBe('8175551234')
  })

  it('formatPhoneUS formats full and partial numbers', () => {
    expect(formatPhoneUS('8175551234')).toBe('(817) 555-1234')
    expect(formatPhoneUS('817-555')).toBe('(817) 555')
    expect(formatPhoneUS('817')).toBe('(817')
    expect(formatPhoneUS('')).toBe('')
  })

  it('normalizePhoneForStorage returns null for empty input', () => {
    expect(normalizePhoneForStorage('')).toBeNull()
    expect(normalizePhoneForStorage('   ')).toBeNull()
    expect(normalizePhoneForStorage('8175551234')).toBe('(817) 555-1234')
  })

  it('normalizePhoneForTel supports US and international', () => {
    expect(normalizePhoneForTel('(817) 555-1234')).toBe('8175551234')
    expect(normalizePhoneForTel('+44 20 7946 0958')).toBe('+442079460958')
  })

  it('phoneMatchesQuery matches formatted display and digit-only search', () => {
    expect(phoneMatchesQuery('(817) 555-1234', '817')).toBe(true)
    expect(phoneMatchesQuery('(817) 555-1234', '555-1234')).toBe(true)
    expect(phoneMatchesQuery('(817) 555-1234', '999')).toBe(false)
  })
})
