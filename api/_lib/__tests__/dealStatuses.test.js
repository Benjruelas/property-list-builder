import { describe, expect, it } from 'vitest'
import {
  coerceDealStatus,
  isLegacyDealColumnId,
} from '../dealStatuses.js'

describe('coerceDealStatus', () => {
  const allowed = new Set(['open', 'pending', 'closed'])

  it('keeps allowed statuses', () => {
    expect(coerceDealStatus('pending', allowed)).toBe('pending')
  })

  it('maps legacy col-N and empty values to fallback', () => {
    expect(coerceDealStatus('col-0', allowed, 'open')).toBe('open')
    expect(coerceDealStatus('', allowed, 'open')).toBe('open')
    expect(coerceDealStatus(null, allowed, 'open')).toBe('open')
  })

  it('returns null for unknown non-legacy statuses', () => {
    expect(coerceDealStatus('won', allowed, 'open')).toBeNull()
  })
})

describe('isLegacyDealColumnId', () => {
  it('matches col-N only', () => {
    expect(isLegacyDealColumnId('col-0')).toBe(true)
    expect(isLegacyDealColumnId('open')).toBe(false)
  })
})
