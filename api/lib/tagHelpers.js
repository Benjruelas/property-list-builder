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
