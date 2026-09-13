import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllLeads = vi.fn()
const kvGet = vi.fn()
const kvSMembers = vi.fn()
const filterVisibleResources = vi.fn((resources) => resources)

vi.mock('../flags.js', () => ({
  flags: {
    LEADS_SHARDED: () => 'on',
  },
}))

vi.mock('../kvBootstrap.js', () => ({
  kv: {
    get: (...args) => kvGet(...args),
    set: vi.fn(),
  },
  kvAvailable: true,
}))

vi.mock('../kvOps.js', () => ({
  kvSAdd: vi.fn(),
  kvSMembers: (...args) => kvSMembers(...args),
  kvMSet: vi.fn(),
}))

vi.mock('../timing.js', () => ({
  withTiming: async (_name, fn) => fn(),
}))

vi.mock('../teams.js', () => ({
  getAllTeams: vi.fn(async () => []),
}))

vi.mock('../shareIndex.js', () => ({
  collectAffectedUidsForResource: vi.fn(() => []),
  syncSharedOwnerIndex: vi.fn(),
}))

vi.mock('../resourceContext.js', () => ({
  filterVisibleResources: (...args) => filterVisibleResources(...args),
  buildAccessContext: vi.fn(),
}))

vi.mock('../leadStore.js', () => ({
  getAllLeads: (...args) => getAllLeads(...args),
}))

describe('getLeadsForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    filterVisibleResources.mockImplementation((resources) => resources)
    kvSMembers.mockResolvedValue([])
    kvGet.mockResolvedValue(null)
  })

  it('fail-opens to monolith when shards are missing visible leads', async () => {
    const monoOnly = {
      id: 'lead_missing_from_shard',
      ownerId: 'user_1',
      firstName: 'Missing',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const onBoth = {
      id: 'lead_on_shard',
      ownerId: 'user_1',
      firstName: 'Present',
      photos: [{ id: 'p1' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    }

    getAllLeads.mockResolvedValue([monoOnly, { ...onBoth, photos: [] }])
    kvGet.mockImplementation(async (key) => {
      if (key === 'leads:user_1') return [onBoth]
      return null
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getLeadsForUser } = await import('../leadRepo.js')
    const result = await getLeadsForUser({ uid: 'user_1' }, {})

    expect(result.map((l) => l.id).sort()).toEqual(['lead_missing_from_shard', 'lead_on_shard'])
    expect(result.find((l) => l.id === 'lead_on_shard')?.photos).toEqual([{ id: 'p1' }])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lead_shard_undercount'))
    warn.mockRestore()
  })

  it('returns shard results when they cover all monolith-visible leads', async () => {
    const lead = {
      id: 'lead_1',
      ownerId: 'user_1',
      firstName: 'Ok',
      photos: [{ id: 'p1' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    getAllLeads.mockResolvedValue([{ ...lead, photos: [] }])
    kvGet.mockImplementation(async (key) => (key === 'leads:user_1' ? [lead] : null))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getLeadsForUser } = await import('../leadRepo.js')
    const result = await getLeadsForUser({ uid: 'user_1' }, {})

    expect(result).toEqual([lead])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
