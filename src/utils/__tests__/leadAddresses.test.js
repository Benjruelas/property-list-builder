import { describe, it, expect } from 'vitest'
import {
  getLeadAddressDetails,
  normalizeLeadAddressesForStorage,
  addressDetailHasMap,
  addressDetailHasCoords,
  addressDetailToParcelData,
  addressDetailsFromForm,
} from '../leadAddresses'

describe('leadAddresses', () => {
  it('reads legacy single address as one detail', () => {
    const details = getLeadAddressDetails({
      address: '123 Main St, Dallas, TX',
      parcelId: 'p1',
      lat: 32.7,
      lng: -96.8,
    })
    expect(details).toHaveLength(1)
    expect(details[0].value).toBe('123 Main St, Dallas, TX')
    expect(details[0].primary).toBe(true)
  })

  it('normalizes addressDetails for storage and syncs primary fields', () => {
    const stored = normalizeLeadAddressesForStorage({
      addressDetails: [
        { value: '456 Oak Ave, Dallas, TX', parcelId: 'p2', lat: 32.8, lng: -96.9, primary: true },
        { value: '789 Pine Rd, Dallas, TX', lat: 32.9, lng: -97.0 },
      ],
    })
    expect(stored.addressDetails).toHaveLength(2)
    expect(stored.address).toBe('456 Oak Ave, Dallas, TX')
    expect(stored.parcelId).toBe('p2')
  })

  it('detects map and directions availability per address', () => {
    const withParcel = { value: '123 Main', parcelId: 'p1' }
    const withCoords = { value: '456 Oak', lat: 32.7, lng: -96.8 }
    expect(addressDetailHasMap(withParcel)).toBe(true)
    expect(addressDetailHasCoords(withParcel)).toBe(false)
    expect(addressDetailHasMap(withCoords)).toBe(true)
    expect(addressDetailHasCoords(withCoords)).toBe(true)
  })

  it('builds parcel data from an address detail', () => {
    const parcel = addressDetailToParcelData(
      { value: '123 Main', parcelId: 'p1', lat: 32.7, lng: -96.8 },
      { id: 'lead_1' },
    )
    expect(parcel.parcelId).toBe('p1')
    expect(parcel.leadId).toBe('lead_1')
    expect(parcel.lat).toBe(32.7)
  })

  it('builds payload from lead form addressDetails', () => {
    const fields = addressDetailsFromForm({
      addressDetails: [
        { value: '123 Main', lat: 32.7, lng: -96.8 },
        { value: '' },
      ],
    })
    expect(fields.addressDetails).toHaveLength(1)
    expect(fields.address).toBe('123 Main')
  })
})
