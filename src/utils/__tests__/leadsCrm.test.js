import { describe, it, expect, beforeEach } from 'vitest'
import {
  getLeadStatus,
  lastContactedAt,
  formatLastContacted,
  mergeListViewLeads,
  findLeadById,
  findLeadByParcelId,
  isParcelALead,
  formatLeadAddress,
  formatAddressProperCase,
  toLeadPatchBody,
  isLeadPhotosOnlyPatch,
  isLeadStatusOnlyPatch,
  mergeLeadPhotos,
  mergeLeadDetailFromPhotoApi,
  isPhotosOnlyEntityChange,
  updateLead,
  saveLocalLeads,
} from '../leads'
import { buildActivityEntry } from '../leadActivity'

function mockLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('lead CRM helpers', () => {
  beforeEach(() => {
    mockLocalStorage()
  })
  it('getLeadStatus derives converted when lead has deals', () => {
    const lead = { id: 'l1', status: 'qualified' }
    expect(getLeadStatus(lead, 1)).toBe('converted')
  })

  it('getLeadStatus preserves lost even with deals', () => {
    const lead = { id: 'l1', status: 'lost' }
    expect(getLeadStatus(lead, 2)).toBe('lost')
  })

  it('lastContactedAt returns latest outreach activity', () => {
    const lead = {
      activity: [
        { type: 'note', at: '2026-01-01T00:00:00.000Z' },
        { type: 'call', at: '2026-02-01T00:00:00.000Z' },
        { type: 'email', at: '2026-01-15T00:00:00.000Z' },
      ],
    }
    expect(lastContactedAt(lead)).toBe('2026-02-01T00:00:00.000Z')
  })

  it('lastContactedAt prefers server-provided lastContactedAt from list view', () => {
    expect(lastContactedAt({ lastContactedAt: '2026-03-01T00:00:00.000Z', activity: [] }))
      .toBe('2026-03-01T00:00:00.000Z')
  })

  it('mergeListViewLeads preserves photos and activity from existing client state', () => {
    const existing = [{
      id: 'l1',
      firstName: 'A',
      photos: [{ id: 'p1' }],
      activity: [{ type: 'call', at: '2026-01-01T00:00:00.000Z' }],
    }]
    const incoming = [{
      id: 'l1',
      firstName: 'A',
      _listView: true,
      photoCount: 1,
    }]
    const merged = mergeListViewLeads(existing, incoming)
    expect(merged[0].photos).toEqual([{ id: 'p1' }])
    expect(merged[0].activity).toHaveLength(1)
    expect(merged[0]._listView).toBe(true)
  })

  it('mergeListViewLeads drops stale cached photos when server photoCount differs', () => {
    const existing = [{
      id: 'l1',
      photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    }]
    const incoming = [{
      id: 'l1',
      _listView: true,
      photoCount: 1,
    }]
    const merged = mergeListViewLeads(existing, incoming)
    expect(merged[0].photos).toBeUndefined()
  })

  it('mergeListViewLeads keeps cached photos when server photoCount is higher during upload race', () => {
    const existing = [{
      id: 'l1',
      photos: [{ id: 'p1' }, { id: 'p2' }],
    }]
    const incoming = [{
      id: 'l1',
      _listView: true,
      photoCount: 3,
    }]
    const merged = mergeListViewLeads(existing, incoming)
    expect(merged[0].photos).toEqual([{ id: 'p1' }, { id: 'p2' }])
  })

  it('mergeListViewLeads skips excluded lead ids (e.g. after delete)', () => {
    const existing = [{
      id: 'l1',
      photos: [{ id: 'p1' }],
      activity: [{ type: 'call', at: '2026-01-01T00:00:00.000Z' }],
    }]
    const incoming = [
      { id: 'l1', firstName: 'A', _listView: true, photoCount: 1 },
      { id: 'l2', firstName: 'B', _listView: true },
    ]
    const merged = mergeListViewLeads(existing, incoming, { excludeIds: new Set(['l1']) })
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('l2')
  })

  it('mergeListViewLeads uses server photos on full poll payloads', () => {
    const existing = [{
      id: 'l1',
      photos: [{ id: 'pending_1', _uploadStatus: 'uploading' }],
    }]
    const incoming = [{
      id: 'l1',
      photos: [{ id: 'p1', key: 'k1', thumbnailKey: 'k1t' }],
    }]
    const merged = mergeListViewLeads(existing, incoming)
    expect(merged[0].photos).toEqual([{ id: 'p1', key: 'k1', thumbnailKey: 'k1t' }])
  })

  it('buildActivityEntry creates valid entry shape', () => {
    const entry = buildActivityEntry('call', 'Called from app', { phone: '555' })
    expect(entry.type).toBe('call')
    expect(entry.summary).toBe('Called from app')
    expect(entry.meta.phone).toBe('555')
    expect(entry.id).toMatch(/^act_/)
  })

  it('formatLastContacted handles recent dates', () => {
    const today = new Date().toISOString()
    expect(formatLastContacted(today)).toBe('Contacted today')
  })

  it('toLeadPatchBody strips sharing fields from full lead sync', () => {
    const payload = toLeadPatchBody({
      id: 'lead_1',
      firstName: 'Jane',
      photos: [{ id: 'p1' }],
      visibility: 'members',
      sharedMemberUids: ['user_2'],
      ownerId: 'user_1',
    })
    expect(payload.firstName).toBe('Jane')
    expect(payload.photos).toHaveLength(1)
    expect(payload.visibility).toBeUndefined()
    expect(payload.sharedMemberUids).toBeUndefined()
    expect(payload.ownerId).toBeUndefined()
  })

  it('isLeadPhotosOnlyPatch detects photo gallery sync payloads', () => {
    expect(isLeadPhotosOnlyPatch({ photos: [], updatedAt: '2026-01-01' })).toBe(true)
    expect(isLeadPhotosOnlyPatch({ photos: [], firstName: 'Jane' })).toBe(false)
  })

  it('isLeadStatusOnlyPatch detects status-only sync payloads', () => {
    expect(isLeadStatusOnlyPatch({ status: 'qualified', statusUpdatedAt: '2026-01-01' })).toBe(true)
    expect(isLeadStatusOnlyPatch({ status: 'qualified', firstName: 'Jane' })).toBe(false)
  })

  it('updateLead preserves contact info on status-only changes', async () => {
    saveLocalLeads([{
      id: 'lead_1',
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main St, Dallas, TX',
      phone: '(555) 111-2222',
      email: 'jane@example.com',
      phones: ['(555) 111-2222'],
      emails: ['jane@example.com'],
      phoneDetails: [{ value: '(555) 111-2222', source: 'user', callerId: '', primary: true }],
      emailDetails: [{ value: 'jane@example.com', source: 'user', callerId: '', primary: true }],
      status: 'new',
    }])

    const saved = await updateLead(async () => null, 'lead_1', {
      status: 'qualified',
      statusUpdatedAt: '2026-01-02T00:00:00.000Z',
    })

    expect(saved.status).toBe('qualified')
    expect(saved.phone).toBe('(555) 111-2222')
    expect(saved.email).toBe('jane@example.com')
    expect(saved.phones).toEqual(['(555) 111-2222'])
    expect(saved.emails).toEqual(['jane@example.com'])
    expect(saved.firstName).toBe('Jane')
    expect(saved.address).toBe('123 Main St, Dallas, TX')
  })

  it('mergeLeadPhotos removes deleted photos from server payloads', () => {
    const prev = [
      { id: 'p1', size: 100 },
      { id: 'p2', size: 200 },
      { id: 'p3', size: 300 },
    ]
    expect(mergeLeadPhotos(prev, [{ id: 'p1', size: 100 }, { id: 'p3', size: 300 }])).toEqual([
      { id: 'p1', size: 100 },
      { id: 'p3', size: 300 },
    ])
    expect(mergeLeadPhotos(prev, [])).toEqual([])
  })

  it('mergeLeadPhotos merges poll additions without dropping existing photos', () => {
    const prev = [{ id: 'p1', size: 100 }]
    expect(mergeLeadPhotos(prev, [{ id: 'p2', size: 50 }])).toEqual([
      { id: 'p1', size: 100 },
      { id: 'p2', size: 50 },
    ])
  })

  it('mergeLeadPhotos drops deleted photos when server snapshot adds new uploads', () => {
    const prev = [
      { id: 'p1', size: 100 },
      { id: 'p2', size: 200 },
      { id: 'p3', size: 300 },
    ]
    expect(mergeLeadPhotos(prev, [{ id: 'p3', size: 300 }, { id: 'p4', size: 400 }])).toEqual([
      { id: 'p3', size: 300 },
      { id: 'p4', size: 400 },
    ])
  })

  it('mergeLeadDetailFromPhotoApi replaces photos from server snapshot', () => {
    const prev = {
      id: 'l1',
      photos: [{ id: 'p1', key: 'old' }],
    }
    const incoming = {
      id: 'l1',
      photos: [
        { id: 'p1', key: 'old', annotatedKey: 'ann1' },
        { id: 'p2', key: 'new' },
      ],
    }
    const merged = mergeLeadDetailFromPhotoApi(prev, incoming)
    expect(merged.photos.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(merged.photos[0].annotatedKey).toBe('ann1')
  })

  it('isPhotosOnlyEntityChange detects photo-only deal/lead updates', () => {
    const prev = { id: 'd1', title: 'Deal', photos: [{ id: 'p1' }] }
    const next = { id: 'd1', title: 'Deal', photos: [], updatedAt: '2026-01-02' }
    expect(isPhotosOnlyEntityChange(prev, next)).toBe(true)
    expect(isPhotosOnlyEntityChange(prev, { ...next, title: 'Changed' })).toBe(false)
  })
})

describe('formatLeadAddress', () => {
  it('title-cases all-caps parcel addresses', () => {
    const lead = {
      address: '123 MAIN ST, DALLAS, TX 75201, United States',
    }
    expect(formatLeadAddress(lead)).toBe('123 Main St, Dallas, TX')
  })

  it('title-cases addresses built from parcel properties', () => {
    const lead = {
      address: '123 MAIN ST, DALLAS, TX',
      properties: {
        STREET: '123 MAIN ST',
        SITUS_CITY: 'DALLAS',
        state2: 'TX',
      },
    }
    expect(formatLeadAddress(lead)).toBe('123 Main St, Dallas, TX')
  })

  it('preserves directionals and ordinals', () => {
    expect(formatAddressProperCase('4521 NW 42ND ST, OKLAHOMA CITY, OK')).toBe(
      '4521 NW 42nd St, Oklahoma City, OK',
    )
  })
})

describe('findLeadById', () => {
  const leads = [{ id: 'lead_1', email: 'a@example.com' }, { id: 2, email: 'b@example.com' }]

  it('matches string and numeric ids', () => {
    expect(findLeadById(leads, 'lead_1')?.email).toBe('a@example.com')
    expect(findLeadById(leads, 2)?.email).toBe('b@example.com')
    expect(findLeadById(leads, '2')?.email).toBe('b@example.com')
  })
})

describe('findLeadByParcelId', () => {
  const leads = [
    {
      id: 'lead_1',
      parcelId: 'LR-100',
      lat: 30.27,
      lng: -97.74,
      properties: { PROP_ID: 'LR-100', LL_UUID: 'uuid-abc' },
    },
    {
      id: 'lead_2',
      parcelId: null,
      lat: 32.78,
      lng: -96.8,
      address: '456 Oak St',
    },
  ]

  it('matches by parcel id string', () => {
    expect(findLeadByParcelId(leads, 'LR-100')?.id).toBe('lead_1')
  })

  it('matches when popup parcel id differs but shares property ids', () => {
    expect(findLeadByParcelId(leads, { id: 'uuid-abc', properties: { LL_UUID: 'uuid-abc' } })?.id).toBe('lead_1')
  })

  it('matches scratch leads by coordinates when parcel id is missing', () => {
    expect(findLeadByParcelId(leads, { lat: 32.78, lng: -96.8 })?.id).toBe('lead_2')
  })

  it('skips coordinate matching when matchCoords is false', () => {
    expect(findLeadByParcelId(leads, { lat: 32.78, lng: -96.8 }, { matchCoords: false })).toBeNull()
    expect(findLeadByParcelId(leads, 'LR-100', { matchCoords: false })?.id).toBe('lead_1')
  })

  it('matches by leadId when navigating from lead detail', () => {
    expect(findLeadByParcelId(leads, { leadId: 'lead_2', id: null })?.id).toBe('lead_2')
  })

  it('isParcelALead reflects findLeadByParcelId', () => {
    expect(isParcelALead(leads, { lat: 32.78, lng: -96.8 })).toBe(true)
    expect(isParcelALead(leads, { lat: 0, lng: 0 })).toBe(false)
  })
})
