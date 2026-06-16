import { describe, it, expect } from 'vitest'
import { parcelDataFromLandRecords, mergeLeadFormWithParcel } from '../resolveLeadParcel'

describe('parcelDataFromLandRecords', () => {
  it('builds parcel data with id, properties, and situs address', () => {
    const result = parcelDataFromLandRecords(
      {
        parcelId: 'LR-123',
        properties: {
          PROP_ID: 'LR-123',
          SITUS_ADDR: '123 Main St',
          SITUS_CITY: 'Austin',
          SITUS_STATE: 'TX',
          SITUS_ZIP: '78701',
          LATITUDE: 30.27,
          LONGITUDE: -97.74,
          OWNER_NAME: 'Jane Doe',
        },
      },
      30.27,
      -97.74
    )

    expect(result).toMatchObject({
      id: 'LR-123',
      lat: 30.27,
      lng: -97.74,
      address: '123 Main St, Austin, TX 78701',
    })
    expect(result.properties.PROP_ID).toBe('LR-123')
  })

  it('returns null when no parcel id', () => {
    expect(
      parcelDataFromLandRecords({ properties: { SITUS_ADDR: '123 Main' } }, 30, -97)
    ).toBeNull()
  })
})

describe('mergeLeadFormWithParcel', () => {
  it('links parcel fields but keeps contact info', () => {
    const merged = mergeLeadFormWithParcel(
      {
        firstName: 'Bob',
        lastName: 'Smith',
        phone: '555-0100',
        email: 'bob@test.com',
        notes: 'Call back',
        address: '123 Main St, Austin, TX',
        parcelId: null,
        lat: 30.27,
        lng: -97.74,
        properties: null,
      },
      {
        id: 'LR-999',
        lat: 30.27,
        lng: -97.74,
        properties: {
          PROP_ID: 'LR-999',
          SITUS_ADDR: '123 Main St',
          SITUS_CITY: 'Austin',
          SITUS_STATE: 'TX',
          SITUS_ZIP: '78701',
          OWNER_NAME: 'Jane Doe',
        },
      }
    )

    expect(merged.parcelId).toBe('LR-999')
    expect(merged.properties?.PROP_ID).toBe('LR-999')
    expect(merged.firstName).toBe('Bob')
    expect(merged.phone).toBe('555-0100')
    expect(merged.notes).toBe('Call back')
  })
})
