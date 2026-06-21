import { normalizeResourceVisibility, VISIBILITY } from './access.js'

export const TAG_TYPES = ['leads', 'deals', 'paths', 'lists']

export const MAX_TAGS_PER_ENTITY = 20

export const DEFAULT_TAG_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626',
  '#0d9488', '#db2777', '#4f46e5', '#d97706', '#65a30d',
]

export function emptyTagRegistry() {
  return { leads: [], deals: [], paths: [], lists: [] }
}

export function normalizeTagRegistry(data) {
  const base = emptyTagRegistry()
  if (!data || typeof data !== 'object') return base
  for (const type of TAG_TYPES) {
    const arr = data[type]
    base[type] = Array.isArray(arr)
      ? arr.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
      : []
  }
  return base
}

export function registryKeyForUid(uid) {
  return `user_tags_${uid}`
}

export function normalizeTagIds(input, existing) {
  if (input === undefined) return existing?.tagIds || []
  if (!Array.isArray(input)) throw new Error('tagIds must be an array')
  const ids = [...new Set(
    input
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
  )].slice(0, MAX_TAGS_PER_ENTITY)
  return ids
}

export function buildTagMetaFromIds(tagIds, definitions) {
  const byId = new Map((definitions || []).map((t) => [t.id, t]))
  return tagIds
    .map((id) => {
      const def = byId.get(id)
      if (!def) return null
      return { id: def.id, name: def.name, color: def.color || DEFAULT_TAG_COLORS[0] }
    })
    .filter(Boolean)
}

export function normalizeTagMetaArray(input, tagIds) {
  if (!Array.isArray(input)) return []
  const allowed = new Set(tagIds)
  return input
    .filter((t) => t && allowed.has(t.id) && typeof t.name === 'string')
    .map((t) => ({
      id: t.id,
      name: String(t.name).trim().slice(0, 40),
      color: typeof t.color === 'string' ? t.color : DEFAULT_TAG_COLORS[0],
    }))
    .slice(0, MAX_TAGS_PER_ENTITY)
}

/**
 * Merge tagIds/tagMeta onto an entity from a PATCH body.
 * When tagIds is provided, validates against the user's registry for `type`.
 */
export function mergeEntityTags(body, existing, registry, type) {
  if (body.tagIds === undefined && body.tagMeta === undefined) {
    return {
      tagIds: existing?.tagIds || [],
      tagMeta: existing?.tagMeta || [],
    }
  }

  const tagIds = normalizeTagIds(body.tagIds, existing)
  const defs = registry?.[type] || []

  if (body.tagIds !== undefined && registry) {
    const existingIds = new Set(existing?.tagIds || [])
    const metaIds = new Set(
      (Array.isArray(body.tagMeta) ? body.tagMeta : existing?.tagMeta || [])
        .map((t) => t?.id)
        .filter(Boolean)
    )
    const unknown = tagIds.filter(
      (id) => !defs.some((t) => t.id === id) && !existingIds.has(id) && !metaIds.has(id)
    )
    if (unknown.length > 0) {
      throw new Error(`Unknown tag: ${unknown[0]}`)
    }
  }

  let tagMeta
  if (body.tagMeta !== undefined) {
    tagMeta = normalizeTagMetaArray(body.tagMeta, tagIds)
  } else if (body.tagIds !== undefined) {
    tagMeta = buildTagMetaFromIds(tagIds, defs.length ? defs : existing?.tagMeta || [])
  } else {
    tagMeta = existing?.tagMeta || []
  }

  return { tagIds, tagMeta }
}

export function stripTagFromEntity(entity, tagId) {
  const tagIds = (entity.tagIds || []).filter((id) => id !== tagId)
  const tagMeta = (entity.tagMeta || []).filter((t) => t.id !== tagId)
  return { ...entity, tagIds, tagMeta }
}

export async function loadTagRegistry(kv, uid) {
  if (!kv || !uid) return emptyTagRegistry()
  try {
    const key = registryKeyForUid(uid)
    const data = await kv.get(key)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return normalizeTagRegistry(parsed)
  } catch {
    return emptyTagRegistry()
  }
}

export async function saveTagRegistry(kv, uid, registry) {
  if (!kv || !uid) return
  const key = registryKeyForUid(uid)
  const normalized = normalizeTagRegistry(registry)
  await kv.set(key, normalized).catch(() => kv.set(key, JSON.stringify(normalized)))
  return normalized
}

function teamMemberUids(team) {
  const uids = new Set()
  if (!team) return uids
  if (team.ownerId) uids.add(team.ownerId)
  for (const m of team.members || []) {
    if (m?.uid) uids.add(m.uid)
  }
  return uids
}

function resolveTeam(teamId, ctx) {
  if (!teamId || !ctx) return null
  if (ctx.teamsIndex?.[teamId]) return ctx.teamsIndex[teamId]
  if (ctx.team?.id === teamId) return ctx.team
  return null
}

/** UIDs of all users with access to a shared resource (optionally excluding one user, e.g. the actor). */
export function collectResourceAccessUids(resource, ctx, { excludeUid = null } = {}) {
  const r = normalizeResourceVisibility(resource, ctx?.team?.id)
  const uids = new Set()

  if (r.ownerId) uids.add(r.ownerId)

  if (r.visibility === VISIBILITY.MEMBERS) {
    for (const uid of r.sharedMemberUids || []) {
      if (uid) uids.add(uid)
    }
  }

  if (r.visibility === VISIBILITY.TEAM && r.teamId) {
    for (const uid of teamMemberUids(resolveTeam(r.teamId, ctx))) uids.add(uid)
  }

  for (const tid of r.teamShares || []) {
    for (const uid of teamMemberUids(resolveTeam(tid, ctx))) uids.add(uid)
  }

  if (excludeUid) uids.delete(excludeUid)
  return [...uids]
}

function resourceHasCollaborators(resource, ctx) {
  const r = normalizeResourceVisibility(resource, ctx?.team?.id)
  if (r.visibility === VISIBILITY.TEAM) return true
  if (r.visibility === VISIBILITY.MEMBERS && (r.sharedMemberUids || []).length > 0) return true
  if ((r.teamShares || []).length > 0) return true
  return false
}

/** Merge tag definitions from entity tagMeta into a user's registry (by id, skip duplicate names). */
export function mergeTagDefinitionsIntoRegistry(registry, type, tagDefinitions) {
  if (!TAG_TYPES.includes(type) || !Array.isArray(tagDefinitions) || tagDefinitions.length === 0) {
    return { registry: normalizeTagRegistry(registry), changed: false }
  }

  const normalized = normalizeTagRegistry(registry)
  const list = [...(normalized[type] || [])]
  const byId = new Map(list.map((t) => [t.id, t]))
  const byNameLower = new Map(list.map((t) => [t.name.toLowerCase(), t]))
  let changed = false

  for (const raw of tagDefinitions) {
    if (!raw?.id || !raw?.name) continue
    const def = {
      id: raw.id,
      name: String(raw.name).trim().slice(0, 40),
      color: typeof raw.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.color)
        ? raw.color
        : DEFAULT_TAG_COLORS[0],
      createdAt: raw.createdAt || new Date().toISOString(),
    }
    if (byId.has(def.id)) continue
    if (byNameLower.has(def.name.toLowerCase())) continue
    list.push(def)
    byId.set(def.id, def)
    byNameLower.set(def.name.toLowerCase(), def)
    changed = true
  }

  if (!changed) return { registry: normalized, changed: false }
  return { registry: { ...normalized, [type]: list }, changed: true }
}

/**
 * Copy tag definitions from a shared lead/deal into each collaborator's tag registry
 * so they can filter by and reuse those tags.
 */
export async function syncTagMetaToCollaborators(kv, { resource, type, tagMeta, actorUid, ctx }) {
  if (!kv || !resource || !['leads', 'deals'].includes(type)) return
  const tags = (Array.isArray(tagMeta) ? tagMeta : []).filter((t) => t?.id && t?.name)
  if (tags.length === 0) return
  if (!resourceHasCollaborators(resource, ctx)) return

  const recipientUids = collectResourceAccessUids(resource, ctx, { excludeUid: actorUid })
  if (recipientUids.length === 0) return

  await Promise.all(recipientUids.map(async (uid) => {
    const current = await loadTagRegistry(kv, uid)
    const { registry: next, changed } = mergeTagDefinitionsIntoRegistry(current, type, tags)
    if (changed) await saveTagRegistry(kv, uid, next)
  }))
}

/** Collect unique tagMeta from pipeline deals for collaborator registry sync. */
export function collectDealTagMetaFromPipeline(pipeline) {
  const byId = new Map()
  for (const deal of pipeline?.deals || []) {
    for (const t of deal?.tagMeta || []) {
      if (t?.id && t?.name && !byId.has(t.id)) byId.set(t.id, t)
    }
  }
  return [...byId.values()]
}
