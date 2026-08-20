import { describe, it, expect } from 'vitest'
import { resolveParcelDisplayAddress, addressFromProperties } from '../reverseGeocode'

describe('resolveParcelDisplayAddress', () => {
  it('uses situs as the title when present', () => {
    const display = resolveParcelDisplayAddress({
      SITUS_ADDR: '511 FALLING LEAVES DR',
      SITUS_CITY: 'DUNCANVILLE',
      SITUS_STATE: 'TX',
      SITUS_ZIP: '75116',
    })
    expect(display).toMatchObject({
      title: '511 FALLING LEAVES DR',
      hasStreetAddress: true,
    })
  })

  it('does not treat parcelstate-only as a street address (sparse parcels layer)', () => {
    const display = resolveParcelDisplayAddress({
      SITUS_STATE: 'TX',
      COUNTY_FIPS: '48113',
      USE_CODE: '1',
    })
    expect(display.hasStreetAddress).toBe(false)
    expect(display.title).toBe('No street address')
    expect(display.subtitle).not.toBe('TX')
    expect(addressFromProperties({ SITUS_STATE: 'TX' })).not.toBe('TX')
  })
})
