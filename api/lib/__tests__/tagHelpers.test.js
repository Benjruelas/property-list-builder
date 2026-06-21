import { describe, it, expect, vi } from 'vitest'
import {
  collectResourceAccessUids,
  mergeTagDefinitionsIntoRegistry,
  syncTagMetaToCollaborators,
  collectDealTagMetaFromPipeline,
  emptyTagRegistry,
} from '../tagHelpers.js'

const team = {
  id: 'team_a',
  ownerId: 'owner-1',
  members: [
    { uid: 'owner-1', role: 'admin' },
    { uid: 'collab-1', role: 'member' },
  ],
}

const ctx = {
  team,
  teamsIndex: { team_a: team },
}

describe('collectResourceAccessUids', () => {
  it('includes owner and shared members for members visibility', () => {
    const lead = {
      ownerId: 'owner-1',
      visibility: 'members',
      sharedMemberUids: ['collab-1', 'collab-2'],
    }
    const uids = collectResourceAccessUids(lead, ctx)
    expect(uids.sort()).toEqual(['collab-1', 'collab-2', 'owner-1'].sort())
  })

  it('excludes the actor uid', () => {
    const lead = {
      ownerId: 'owner-1',
      visibility: 'members',
      sharedMemberUids: ['collab-1'],
    }
    expect(collectResourceAccessUids(lead, ctx, { excludeUid: 'collab-1' })).toEqual(['owner-1'])
  })

  it('includes team members for team visibility', () => {
    const pipeline = {
      ownerId: 'owner-1',
      visibility: 'team',
      teamId: 'team_a',
    }
    expect(collectResourceAccessUids(pipeline, ctx).sort()).toEqual(['collab-1', 'owner-1'].sort())
  })
})

describe('mergeTagDefinitionsIntoRegistry', () => {
  it('adds new tag definitions by id', () => {
    const { registry, changed } = mergeTagDefinitionsIntoRegistry(emptyTagRegistry(), 'leads', [
      { id: 'tag_1', name: 'Hot', color: '#2563eb' },
    ])
    expect(changed).toBe(true)
    expect(registry.leads).toHaveLength(1)
    expect(registry.leads[0].name).toBe('Hot')
  })

  it('skips duplicate ids and duplicate names', () => {
    const base = {
      leads: [{ id: 'tag_1', name: 'Hot', color: '#2563eb', createdAt: '2020-01-01' }],
      deals: [],
      paths: [],
      lists: [],
    }
    const { registry, changed } = mergeTagDefinitionsIntoRegistry(base, 'leads', [
      { id: 'tag_1', name: 'Hot', color: '#2563eb' },
      { id: 'tag_2', name: 'hot', color: '#16a34a' },
    ])
    expect(changed).toBe(false)
    expect(registry.leads).toHaveLength(1)
  })
})

describe('collectDealTagMetaFromPipeline', () => {
  it('dedupes tagMeta across deals', () => {
    const meta = collectDealTagMetaFromPipeline({
      deals: [
        { tagMeta: [{ id: 't1', name: 'A', color: '#2563eb' }] },
        { tagMeta: [{ id: 't1', name: 'A', color: '#2563eb' }, { id: 't2', name: 'B', color: '#16a34a' }] },
      ],
    })
    expect(meta.map((t) => t.id).sort()).toEqual(['t1', 't2'])
  })
})

describe('syncTagMetaToCollaborators', () => {
  it('writes tags into collaborator registries', async () => {
    const store = new Map()
    const kv = {
      get: vi.fn(async (key) => store.get(key) ?? null),
      set: vi.fn(async (key, val) => { store.set(key, val) }),
    }

    await syncTagMetaToCollaborators(kv, {
      resource: {
        ownerId: 'owner-1',
        visibility: 'members',
        sharedMemberUids: ['collab-1'],
      },
      type: 'leads',
      tagMeta: [{ id: 'tag_x', name: 'Follow up', color: '#2563eb' }],
      actorUid: 'owner-1',
      ctx,
    })

    expect(kv.set).toHaveBeenCalledWith(
      'user_tags_collab-1',
      expect.objectContaining({
        leads: [expect.objectContaining({ id: 'tag_x', name: 'Follow up' })],
      }),
    )
  })

  it('does not sync private resources', async () => {
    const kv = { get: vi.fn(), set: vi.fn() }
    await syncTagMetaToCollaborators(kv, {
      resource: { ownerId: 'owner-1', visibility: 'private' },
      type: 'leads',
      tagMeta: [{ id: 'tag_x', name: 'Follow up', color: '#2563eb' }],
      actorUid: 'owner-1',
      ctx,
    })
    expect(kv.set).not.toHaveBeenCalled()
  })
})
