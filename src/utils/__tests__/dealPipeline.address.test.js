import { describe, it, expect } from 'vitest'
import { getFullAddress } from '../dealPipeline'

describe('getFullAddress', () => {
  it('formats a full situs address', () => {
    expect(getFullAddress({
      properties: {
        SITUS_ADDR: '123 Main St',
        SITUS_CITY: 'Austin',
        SITUS_STATE: 'TX',
        SITUS_ZIP: '78701',
      },
    })).toBe('123 Main St, Austin, TX 78701')
  })

  it('does not treat parcelstate-only sparse tiles as an address', () => {
    expect(getFullAddress({
      properties: { SITUS_STATE: 'TX', PROP_ID: 'abc' },
    })).toBe('Unknown')
    expect(getFullAddress({
      address: 'Loading…',
      properties: { SITUS_STATE: 'TX' },
    })).toBe('Unknown')
  })
})
