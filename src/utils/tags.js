/**
 * Per-entity-type tag registry and helpers.
 */

export const TAG_TYPES = ['leads', 'deals', 'paths', 'lists']

export const DEFAULT_TAG_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626',
  '#0d9488', '#db2777', '#4f46e5', '#d97706', '#65a30d',
]

const LOCAL_TAGS_KEY = 'user_tags_local'

import { getApiBase } from './apiBase'

export function emptyTagRegistry() {
  return { leads: [], deals: [], paths: [], lists: [] }
}

/** Merge one tag definition into a registry copy (no network). */
export function upsertTagInRegistry(registry, type, tag) {
  if (!tag?.id || !TAG_TYPES.includes(type)) return registry
  const list = registry?.[type] || []
  return {
    ...registry,
    [type]: [...list.filter((t) => t.id !== tag.id), tag],
  }
}

export function loadLocalTagRegistry() {
  try {
    const stored = localStorage.getItem(LOCAL_TAGS_KEY)
    if (!stored) return emptyTagRegistry()
    const parsed = JSON.parse(stored)
    const base = emptyTagRegistry()
    for (const type of TAG_TYPES) {
      base[type] = Array.isArray(parsed?.[type]) ? parsed[type] : []
    }
    return base
  } catch {
    return emptyTagRegistry()
  }
}

export function saveLocalTagRegistry(registry) {
  try {
    localStorage.setItem(LOCAL_TAGS_KEY, JSON.stringify(registry))
  } catch (e) {
    console.error('Error saving local tags:', e)
  }
}

export async function fetchTagRegistry(getToken) {
  const token = await getToken()
  if (!token) return loadLocalTagRegistry()
  const res = await fetch(`${getApiBase()}/tags`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch tags')
  const data = await res.json()
  return data.registry || emptyTagRegistry()
}

export async function createTag(getToken, type, name, color) {
  const token = await getToken()
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Tag name is required')

  if (!token) {
    const registry = loadLocalTagRegistry()
    const existing = registry[type] || []
    const dup = existing.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (dup) return dup
    const tag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: trimmed,
      color: color || DEFAULT_TAG_COLORS[existing.length % DEFAULT_TAG_COLORS.length],
      createdAt: new Date().toISOString(),
    }
    registry[type] = [...existing, tag]
    saveLocalTagRegistry(registry)
    return tag
  }

  const res = await fetch(`${getApiBase()}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, name: trimmed, color }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 409 && err.tag) return err.tag
    throw new Error(err.error || 'Failed to create tag')
  }
  const data = await res.json()
  return data.tag
}

export async function updateTag(getToken, type, id, updates = {}) {
  const token = await getToken()
  if (!token) {
    const registry = loadLocalTagRegistry()
    const list = registry[type] || []
    const idx = list.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error('Tag not found')
    const tag = { ...list[idx], ...updates }
    if (updates.name !== undefined) tag.name = String(updates.name).trim()
    list[idx] = tag
    registry[type] = list
    saveLocalTagRegistry(registry)
    return tag
  }

  const res = await fetch(`${getApiBase()}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, id, ...updates }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update tag')
  }
  const data = await res.json()
  return data.tag
}

export async function deleteTag(getToken, type, id) {
  const token = await getToken()
  if (!token) {
    const registry = loadLocalTagRegistry()
    registry[type] = (registry[type] || []).filter((t) => t.id !== id)
    saveLocalTagRegistry(registry)
    return
  }

  const res = await fetch(`${getApiBase()}/tags`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, id }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete tag')
  }
}

export function resolveTagMeta(entity, registry, type) {
  if (Array.isArray(entity?.tagMeta) && entity.tagMeta.length > 0) {
    return entity.tagMeta
  }
  const ids = entity?.tagIds || []
  const defs = registry?.[type] || []
  const byId = new Map(defs.map((t) => [t.id, t]))
  return ids
    .map((id) => {
      const def = byId.get(id)
      if (!def) return null
      return { id: def.id, name: def.name, color: def.color }
    })
    .filter(Boolean)
}

export function buildTagMetaFromIds(tagIds, registry, type) {
  const defs = registry?.[type] || []
  const byId = new Map(defs.map((t) => [t.id, t]))
  return tagIds
    .map((id) => {
      const def = byId.get(id)
      if (!def) return null
      return { id: def.id, name: def.name, color: def.color || DEFAULT_TAG_COLORS[0] }
    })
    .filter(Boolean)
}

export function applyTagsToEntity(type, entity, tagIds, registry) {
  const tagMeta = buildTagMetaFromIds(tagIds, registry, type)
  return { ...entity, tagIds, tagMeta }
}

export function filterByTags(items, selectedTagIds) {
  if (!selectedTagIds?.length) return items
  const required = new Set(selectedTagIds)
  return items.filter((item) => {
    const ids = item?.tagIds || []
    for (const id of required) {
      if (!ids.includes(id)) return false
    }
    return true
  })
}

export function getEntityTagIds(entity) {
  return entity?.tagIds || []
}

export function collectTagMetaFromEntities(entities) {
  const byId = new Map()
  for (const entity of entities || []) {
    for (const t of entity?.tagMeta || []) {
      if (t?.id && t?.name && !byId.has(t.id)) {
        byId.set(t.id, {
          id: t.id,
          name: String(t.name).trim(),
          color: typeof t.color === 'string' ? t.color : DEFAULT_TAG_COLORS[0],
          createdAt: t.createdAt,
        })
      }
    }
  }
  return [...byId.values()]
}

export function mergeTagDefinitionLists(registryTags, extraTags) {
  const base = Array.isArray(registryTags) ? [...registryTags] : []
  const byId = new Map(base.map((t) => [t.id, t]))
  const byNameLower = new Map(base.map((t) => [t.name.toLowerCase(), t]))
  const out = [...base]

  for (const raw of extraTags || []) {
    if (!raw?.id || !raw?.name) continue
    if (byId.has(raw.id)) continue
    const nameLower = String(raw.name).trim().toLowerCase()
    if (byNameLower.has(nameLower)) continue
    const def = {
      id: raw.id,
      name: String(raw.name).trim().slice(0, 40),
      color: typeof raw.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.color)
        ? raw.color
        : DEFAULT_TAG_COLORS[0],
      createdAt: raw.createdAt || new Date().toISOString(),
    }
    out.push(def)
    byId.set(def.id, def)
    byNameLower.set(nameLower, def)
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Union personal registry tags with tags on visible entities for filter/picker UI. */
export function buildFilterableTags(type, registry, visibleEntities) {
  const registryTags = registry?.[type] || []
  const entityTags = collectTagMetaFromEntities(visibleEntities)
  return mergeTagDefinitionLists(registryTags, entityTags)
}
