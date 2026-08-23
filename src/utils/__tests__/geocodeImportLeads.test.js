import { describe, expect, it, vi } from 'vitest'
import { geocodeLeadsForImport } from '../geocodeAddress'

describe('geocodeLeadsForImport', () => {
  it('fills coords when an address is present and leaves failures list-only', async () => {
    const geocode = vi.fn(async (address) => (
      address.includes('Fail') ? null : { lat: 32.7, lng: -97.3, address }
    ))
    const out = await geocodeLeadsForImport([
      { firstName: 'A', address: '123 Main St' },
      { firstName: 'B', address: 'Fail Lane' },
      { firstName: 'C', address: 'Already pinned', lat: 1, lng: 2 },
    ], { geocode, concurrency: 2 })

    expect(out[0]).toMatchObject({ lat: 32.7, lng: -97.3 })
    expect(out[1].lat).toBeUndefined()
    expect(out[2]).toMatchObject({ lat: 1, lng: 2 })
    expect(geocode).toHaveBeenCalledTimes(2)
  })

  it('geocodes each addressDetails entry and copies the primary coords', async () => {
    const geocode = vi.fn(async (address) => ({
      lat: address.includes('Oak') ? 33.1 : 32.7,
      lng: address.includes('Oak') ? -97.1 : -97.3,
      address,
    }))
    const out = await geocodeLeadsForImport([{
      firstName: 'Kevin',
      address: '123 Main St',
      addressDetails: [
        { value: '123 Main St', primary: true },
        { value: '456 Oak Ave' },
      ],
    }], { geocode })

    expect(geocode).toHaveBeenCalledTimes(2)
    expect(out[0].lat).toBe(32.7)
    expect(out[0].lng).toBe(-97.3)
    expect(out[0].addressDetails[0]).toMatchObject({ value: '123 Main St', lat: 32.7, lng: -97.3 })
    expect(out[0].addressDetails[1]).toMatchObject({ value: '456 Oak Ave', lat: 33.1, lng: -97.1 })
  })
})
