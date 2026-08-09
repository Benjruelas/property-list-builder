import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parcelDataFromLandRecords,
  parcelDataFromTileHit,
  mergeLeadFormWithParcel,
  resolveLeadParcelAtLocation,
} from '../resolveLeadParcel'

vi.mock('../fetchLandRecordsParcel', () => ({
  fetchLandRecordsParcel: vi.fn(),
}))

import { fetchLandRecordsParcel } from '../fetchLandRecordsParcel'

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

describe('parcelDataFromTileHit', () => {
  it('maps a rendered tile hit into parcel-shaped lead data', () => {
    const result = parcelDataFromTileHit(
      {
        id: '20832----1----1',
        lat: 32.566,
        lng: -97.33,
        properties: {
          PROP_ID: '20832----1----1',
          SITUS_ADDR: '615 NE MCALISTER RD',
          SITUS_CITY: 'Burleson',
          SITUS_STATE: 'TX',
          SITUS_ZIP: '76028',
          OWNER_NAME: 'MANESS, TINA S',
        },
      },
      32.5,
      -97.3,
    )
    expect(result).toMatchObject({
      id: '20832----1----1',
      lat: 32.566,
      lng: -97.33,
      address: '615 NE MCALISTER RD, Burleson, TX 76028',
    })
  })
})

describe('resolveLeadParcelAtLocation', () => {
  beforeEach(() => {
    fetchLandRecordsParcel.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses a rich tile hit without calling LandRecords WFS/WMS', async () => {
    const tileParcel = {
      id: '20832----1----1',
      lrid: 'a1474373-2523-bfc6-8ec9-78eecd8d18d7',
      properties: {
        PROP_ID: '20832----1----1',
        SITUS_ADDR: '615 NE MCALISTER RD',
        SITUS_CITY: 'Burleson',
        SITUS_STATE: 'TX',
        SITUS_ZIP: '76028',
      },
    }

    const result = await resolveLeadParcelAtLocation(32.566, -97.33, {
      lrid: tileParcel.lrid,
      tileParcel,
    })

    expect(fetchLandRecordsParcel).not.toHaveBeenCalled()
    expect(result?.id).toBe('20832----1----1')
    expect(result?.address).toContain('615 NE MCALISTER RD')
  })

  it('falls back to a sparse tile hit when the API returns nothing', async () => {
    fetchLandRecordsParcel.mockResolvedValue(null)
    const tileParcel = {
      id: '20832----1----1',
      properties: { PROP_ID: '20832----1----1' },
    }

    const result = await resolveLeadParcelAtLocation(32.566, -97.33, {
      lrid: 'a1474373-2523-bfc6-8ec9-78eecd8d18d7',
      tileParcel,
    })

    expect(fetchLandRecordsParcel).toHaveBeenCalled()
    expect(result?.id).toBe('20832----1----1')
  })
})
