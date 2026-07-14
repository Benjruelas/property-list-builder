import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../flags.js', () => ({
  flags: {
    LEADS_SHARDED: () => 'on',
    LEADS_LOCK: () => false,
    VERSIONED_POLL: () => false,
  },
}))

vi.mock('../kvBootstrap.js', () => ({
  kv: null,
  kvAvailable: false,
}))

vi.mock('../localDevPersistence.js', () => ({
  readLocalDevArray: vi.fn(async () => []),
  writeLocalDevArray: vi.fn(async () => {}),
}))

vi.mock('../leadRepo.js', () => ({
  writeLeadToShards: vi.fn(async () => {}),
  removeLeadIndex: vi.fn(async () => {}),
  syncSharedIndexForLead: vi.fn(async () => {}),
  getLeadOwnerId: vi.fn(async (leadId) => (leadId === 'shared_lead' ? 'owner_uid' : null)),
  getOwnerLeads: vi.fn(async (ownerId) => (
    ownerId === 'owner_uid'
      ? [{ id: 'shared_lead', ownerId: 'owner_uid', photos: [], firstName: 'A', lastName: 'B' }]
      : []
  )),
  saveOwnerLeads: vi.fn(async () => {}),
}))

vi.mock('../entityLeadStore.js', () => ({
  writeLeadEntities: vi.fn(async () => {}),
  deleteLeadEntity: vi.fn(async () => {}),
}))

vi.mock('../teams.js', () => ({
  getAllTeams: vi.fn(async () => []),
}))

vi.mock('../dataVersion.js', () => ({
  bumpLeadsVersionsForResource: vi.fn(async () => {}),
}))

describe('mutateSingleLead shard fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates owner shard when lead is missing from monolith', async () => {
    const { mutateSingleLead } = await import('../leadStore.js')
    const { saveOwnerLeads, getOwnerLeads } = await import('../leadRepo.js')
    const { writeLeadEntities } = await import('../entityLeadStore.js')

    const photo = { id: 'photo_1', key: 'lead-photos/owner_uid/shared_lead/photo_1/original.jpg' }
    const updated = await mutateSingleLead('shared_lead', (existing) => ({
      ...existing,
      photos: [...(existing.photos || []), photo],
    }))

    expect(updated?.photos).toHaveLength(1)
    expect(updated.photos[0].id).toBe('photo_1')
    expect(saveOwnerLeads).toHaveBeenCalledWith(
      'owner_uid',
      expect.arrayContaining([
        expect.objectContaining({ id: 'shared_lead', photos: [photo] }),
      ]),
    )
    expect(getOwnerLeads).toHaveBeenCalledWith('owner_uid')
    expect(writeLeadEntities).toHaveBeenCalledWith([expect.objectContaining({ id: 'shared_lead' })])
  })
})
