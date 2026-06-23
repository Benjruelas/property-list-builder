import { describe, it, expect } from 'vitest'
import {
  buildFilterableTags,
  collectTagMetaFromEntities,
  mergeTagDefinitionLists,
  filterByTags,
  emptyTagRegistry,
} from '../tags.js'

describe('collectTagMetaFromEntities', () => {
  it('collects unique tags from entity tagMeta', () => {
    const tags = collectTagMetaFromEntities([
      { tagMeta: [{ id: 'a', name: 'Alpha', color: '#2563eb' }] },
      { tagMeta: [{ id: 'b', name: 'Beta', color: '#16a34a' }] },
    ])
    expect(tags).toHaveLength(2)
  })
})

describe('buildFilterableTags', () => {
  it('unions registry tags with tags on visible entities', () => {
    const registry = {
      ...emptyTagRegistry(),
      leads: [{ id: 'mine', name: 'Mine', color: '#2563eb', createdAt: '2020-01-01' }],
    }
    const leads = [
      { tagIds: ['shared'], tagMeta: [{ id: 'shared', name: 'Shared', color: '#16a34a' }] },
    ]
    const filterTags = buildFilterableTags('leads', registry, leads)
    expect(filterTags.map((t) => t.id).sort()).toEqual(['mine', 'shared'])
  })

  it('includes personal tags not yet on any visible item', () => {
    const registry = {
      ...emptyTagRegistry(),
      leads: [{ id: 'unused', name: 'Unused', color: '#2563eb', createdAt: '2020-01-01' }],
    }
    const filterTags = buildFilterableTags('leads', registry, [])
    expect(filterTags).toHaveLength(1)
    expect(filterTags[0].id).toBe('unused')
  })
})

describe('filterByTags with shared tag ids', () => {
  it('filters items by tag ids on entities', () => {
    const items = [
      { id: '1', tagIds: ['shared'] },
      { id: '2', tagIds: ['other'] },
    ]
    const filtered = filterByTags(items, ['shared'])
    expect(filtered.map((i) => i.id)).toEqual(['1'])
  })
})

describe('mergeTagDefinitionLists', () => {
  it('skips duplicate names from extras', () => {
    const merged = mergeTagDefinitionLists(
      [{ id: 'a', name: 'Hot', color: '#2563eb', createdAt: '2020-01-01' }],
      [{ id: 'b', name: 'hot', color: '#16a34a' }],
    )
    expect(merged).toHaveLength(1)
  })
})
