import { describe, expect, it, vi } from 'vitest'

vi.mock('../resourceContext.js', () => ({
  getResourceAccess: vi.fn(() => 'owner'),
  applyResourceVisibilityPatch: (base, body) => ({
    ...base,
    visibility: body.visibility || base.visibility,
    sharedMemberUids: body.sharedMemberUids || base.sharedMemberUids || [],
  }),
}))

vi.mock('../tagHelpers.js', () => ({
  mergeEntityTags: (body) => ({
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
    tagMeta: [],
  }),
}))

vi.mock('../leadStatuses.js', async () => {
  const actual = await vi.importActual('../leadStatuses.js')
  return actual
})

vi.mock('../leadContact.js', async () => {
  const actual = await vi.importActual('../leadContact.js')
  return actual
})

vi.mock('../leadAddresses.js', async () => {
  const actual = await vi.importActual('../leadAddresses.js')
  return actual
})

vi.mock('../customFields.js', async () => {
  const actual = await vi.importActual('../customFields.js')
  return actual
})

vi.mock('../statusAutoTasks.js', async () => {
  const actual = await vi.importActual('../statusAutoTasks.js')
  return actual
})

vi.mock('../kvBootstrap.js', () => ({
  kv: null,
  kvAvailable: false,
}))

import {
  buildImportDuplicateIndex,
  findImportDuplicateReason,
  prepareImportedLeads,
} from '../importLeadsBatch.js'

const user = { uid: 'u1', email: 'owner@example.com' }
const ctx = { team: { id: 'team_1' }, teamsIndex: {} }
const allowed = new Set(['new', 'contacted', 'qualified', 'converted', 'lost'])

describe('import duplicate index', () => {
  it('matches email, phone, and name+address', () => {
    const index = buildImportDuplicateIndex([{
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main St',
      email: 'jane@example.com',
      phone: '(817) 555-0100',
    }])
    expect(findImportDuplicateReason({ email: 'JANE@example.com' }, index)).toMatch(/email/)
    expect(findImportDuplicateReason({ phone: '8175550100' }, index)).toMatch(/phone/)
    expect(findImportDuplicateReason({
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main St',
    }, index)).toMatch(/name and address/)
  })
})

describe('prepareImportedLeads', () => {
  it('creates valid leads and reports per-row errors without throwing', () => {
    const { created, errors } = prepareImportedLeads({
      inputs: [
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        { notes: 'no name' },
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        { firstName: 'Other', status: 'not-real' },
      ],
      user,
      ctx,
      visibleLeads: [],
      allLeads: [],
      allowedStatusIds: allowed,
      fieldDefs: [],
    })
    expect(created).toHaveLength(1)
    expect(created[0].firstName).toBe('Ada')
    expect(created[0].ownerId).toBe('u1')
    expect(created[0].visibility).toBe('private')
    expect(created[0].autoTaskFiredStatusIds).toEqual([])
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 1, message: 'First or last name is required' }),
      expect.objectContaining({ index: 2, message: expect.stringMatching(/email/) }),
      expect.objectContaining({ index: 3, message: expect.stringMatching(/Invalid lead status/) }),
    ]))
  })

  it('skips duplicates against existing visible leads and parcel conflicts', () => {
    const existing = {
      id: 'lead_old',
      firstName: 'Sam',
      lastName: 'Existing',
      email: 'sam@example.com',
      parcelId: 'p1',
      ownerId: user.uid,
    }
    const { created, errors } = prepareImportedLeads({
      inputs: [
        { firstName: 'Sam', lastName: 'New', email: 'sam@example.com' },
        { firstName: 'Pat', lastName: 'Parcel', parcelId: 'p1', address: '1 Oak' },
      ],
      user,
      ctx,
      visibleLeads: [existing],
      allLeads: [existing],
      allowedStatusIds: allowed,
    })
    expect(created).toHaveLength(0)
    expect(errors.map((e) => e.message).join(' ')).toMatch(/email/)
    expect(errors.map((e) => e.message).join(' ')).toMatch(/parcel/)
  })

  it('applies request-level visibility', () => {
    const { created } = prepareImportedLeads({
      inputs: [{ firstName: 'Ada' }],
      user,
      ctx,
      allowedStatusIds: allowed,
      visibility: 'team',
    })
    expect(created[0].visibility).toBe('team')
  })
})
