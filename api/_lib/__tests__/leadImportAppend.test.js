import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = new Map()
const kvSets = new Map()

vi.mock('../flags.js', () => ({
  flags: {
    LEADS_SHARDED: () => 'on',
    LEADS_LOCK: () => false,
    VERSIONED_POLL: () => false,
  },
}))

vi.mock('../kvBootstrap.js', () => ({
  kv: {
    get: vi.fn(async (key) => kvStore.get(key) ?? null),
    set: vi.fn(async (key, value) => { kvStore.set(key, value) }),
    del: vi.fn(async (key) => { kvStore.delete(key) }),
  },
  kvAvailable: true,
}))

vi.mock('../kvOps.js', async () => {
  const actual = await vi.importActual('../kvOps.js')
  return {
    ...actual,
    kvSAdd: vi.fn(async (key, ...members) => {
      if (!kvSets.has(key)) kvSets.set(key, new Set())
      for (const member of members) kvSets.get(key).add(member)
    }),
    kvSMembers: vi.fn(async (key) => [...(kvSets.get(key) || [])]),
    kvMSet: vi.fn(async (entries) => {
      for (const [key, value] of Object.entries(entries || {})) {
        kvStore.set(key, value)
      }
    }),
  }
})

vi.mock('../localDevPersistence.js', () => ({
  readLocalDevArray: vi.fn(async () => []),
  writeLocalDevArray: vi.fn(async () => {}),
}))

vi.mock('../entityLeadStore.js', () => ({
  writeLeadEntities: vi.fn(async () => {}),
  deleteLeadEntity: vi.fn(async () => {}),
}))

vi.mock('../teams.js', async () => {
  const actual = await vi.importActual('../teams.js')
  return {
    ...actual,
    getAllTeams: vi.fn(async () => []),
  }
})

vi.mock('../dataVersion.js', () => ({
  bumpLeadsVersionsForResource: vi.fn(async () => {}),
}))

describe('import append-only writes', () => {
  beforeEach(() => {
    kvStore.clear()
    kvSets.clear()
    vi.clearAllMocks()
  })

  it('appends imported leads without rewriting existing shard leads', async () => {
    const existingLead = {
      id: 'lead_existing',
      ownerId: 'owner_1',
      firstName: 'Jane',
      lastName: 'Doe',
      photos: [{ id: 'photo_1' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    kvStore.set('user_leads', [existingLead])
    kvStore.set('leads:owner_1', [existingLead])

    const { mutateLeads } = await import('../leadStore.js')
    const imported = [{
      id: 'lead_imported',
      ownerId: 'owner_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      photos: [],
      updatedAt: '2026-03-01T00:00:00.000Z',
    }]

    await mutateLeads((current) => [...current, ...imported], {
      changedResources: imported.map((resource) => ({ resource })),
      appendOnly: true,
    })

    const monolith = kvStore.get('user_leads')
    const shard = kvStore.get('leads:owner_1')

    expect(monolith).toHaveLength(2)
    expect(shard).toHaveLength(2)
    expect(shard.find((lead) => lead.id === 'lead_existing')?.photos).toEqual([{ id: 'photo_1' }])
    expect(shard.find((lead) => lead.id === 'lead_imported')?.firstName).toBe('Ada')
  })

  it('does not overwrite an existing lead when import payload reuses an id', async () => {
    const existingLead = {
      id: 'lead_existing',
      ownerId: 'owner_1',
      firstName: 'Jane',
      lastName: 'Doe',
      photos: [{ id: 'photo_1' }],
      notes: 'Keep me',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    kvStore.set('user_leads', [existingLead])
    kvStore.set('leads:owner_1', [existingLead])

    const { mutateLeads } = await import('../leadStore.js')
    const collision = [{
      ...existingLead,
      firstName: 'Overwritten',
      photos: [],
      notes: 'Import attempt',
      updatedAt: '2026-03-01T00:00:00.000Z',
    }]

    await mutateLeads((current) => {
      const existingIds = new Set(current.map((lead) => lead.id))
      const toAdd = collision.filter((lead) => !existingIds.has(lead.id))
      if (!toAdd.length) return undefined
      return [...current, ...toAdd]
    }, {
      changedResources: collision.map((resource) => ({ resource })),
      appendOnly: true,
    })

    const monolith = kvStore.get('user_leads')
    const shard = kvStore.get('leads:owner_1')

    expect(monolith).toHaveLength(1)
    expect(shard).toHaveLength(1)
    expect(monolith[0].firstName).toBe('Jane')
    expect(monolith[0].photos).toEqual([{ id: 'photo_1' }])
    expect(shard[0].notes).toBe('Keep me')
  })
})
