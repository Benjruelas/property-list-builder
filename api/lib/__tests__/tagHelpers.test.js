import { describe, it, expect, vi } from 'vitest'
import {
  collectResourceAccessUids,
  mergeTagDefinitionsIntoRegistry,
  syncTagMetaToCollaborators,
  collectDealTagMetaFromPipeline,
  collectTagMetaFromEntities,
  mergeTagDefinitionLists,
  hydrateUserRegistryFromTagMeta,
  mergeEntityTags,
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

describe('collectTagMetaFromEntities', () => {
  it('dedupes tagMeta across entities', () => {
    const tags = collectTagMetaFromEntities([
      { tagMeta: [{ id: 't1', name: 'Hot', color: '#2563eb' }] },
      { tagMeta: [{ id: 't1', name: 'Hot', color: '#2563eb' }, { id: 't2', name: 'Warm', color: '#16a34a' }] },
    ])
    expect(tags.map((t) => t.id).sort()).toEqual(['t1', 't2'])
  })
})

describe('mergeTagDefinitionLists', () => {
  it('unions registry tags with entity tags by id', () => {
    const merged = mergeTagDefinitionLists(
      [{ id: 'mine', name: 'Mine', color: '#2563eb', createdAt: '2020-01-01' }],
      [{ id: 'shared', name: 'Shared', color: '#16a34a' }],
    )
    expect(merged.map((t) => t.id).sort()).toEqual(['mine', 'shared'])
  })

  it('prefers registry entry when id already exists', () => {
    const merged = mergeTagDefinitionLists(
      [{ id: 't1', name: 'Registry Name', color: '#2563eb', createdAt: '2020-01-01' }],
      [{ id: 't1', name: 'Other Name', color: '#16a34a' }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Registry Name')
  })
})

describe('hydrateUserRegistryFromTagMeta', () => {
  it('persists visible tags into user registry', async () => {
    const store = new Map()
    const kv = {
      get: vi.fn(async (key) => store.get(key) ?? null),
      set: vi.fn(async (key, val) => { store.set(key, val) }),
    }

    const { changed } = await hydrateUserRegistryFromTagMeta(kv, 'user-b', 'leads', [
      { id: 'tag_shared', name: 'Follow up', color: '#2563eb' },
    ])
    expect(changed).toBe(true)
    expect(kv.set).toHaveBeenCalledWith(
      'user_tags_user-b',
      expect.objectContaining({
        leads: [expect.objectContaining({ id: 'tag_shared', name: 'Follow up' })],
      }),
    )
  })
})

describe('mergeEntityTags', () => {
  it('allows tag ids provided in body.tagMeta even when not in registry', () => {
    const registry = emptyTagRegistry()
    const result = mergeEntityTags(
      {
        tagIds: ['tag_shared'],
        tagMeta: [{ id: 'tag_shared', name: 'Shared', color: '#2563eb' }],
      },
      { tagIds: [], tagMeta: [] },
      registry,
      'leads',
    )
    expect(result.tagIds).toEqual(['tag_shared'])
    expect(result.tagMeta[0].name).toBe('Shared')
  })
})
