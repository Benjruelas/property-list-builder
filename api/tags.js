import { authenticate } from './_lib/auth.js'
import { mutateLeads } from './_lib/leadStore.js'
import { mutatePipelines } from './_lib/pipelineStoreFull.js'
import {
  TAG_TYPES,
  DEFAULT_TAG_COLORS,
  emptyTagRegistry,
  normalizeTagRegistry,
  registryKeyForUid,
  loadTagRegistry,
  saveTagRegistry,
  stripTagFromEntity,
} from './_lib/tagHelpers.js'

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

const LISTS_KEY = 'user_lists'
const PATHS_KEY = 'user_paths'

let fallbackRegistry = emptyTagRegistry()
const fallbackStores = {
  lists: [],
  paths: [],
}

async function readArray(key, storeKey) {
  if (!kvAvailable || !kv) return fallbackStores[storeKey]
  try {
    const data = await kv.get(key)
    const arr = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(arr) ? arr : []
    fallbackStores[storeKey] = result
    return result
  } catch {
    return fallbackStores[storeKey]
  }
}

async function writeArray(key, storeKey, arr) {
  fallbackStores[storeKey] = arr
  if (!kvAvailable || !kv) return
  try {
    await kv.set(key, arr).catch(() => kv.set(key, JSON.stringify(arr)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
}

function pickColor(index) {
  return DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length]
}

async function sweepTagFromEntities(uid, type, tagId) {
  if (type === 'leads') {
    await mutateLeads((all) => {
      let changed = false
      const next = all.map((item) => {
        if (item.ownerId !== uid || !(item.tagIds || []).includes(tagId)) return item
        changed = true
        return stripTagFromEntity(item, tagId)
      })
      return changed ? next : undefined
    })
    return
  }

  if (type === 'lists') {
    const all = await readArray(LISTS_KEY, 'lists')
    let changed = false
    const next = all.map((item) => {
      if (item.ownerId !== uid || !(item.tagIds || []).includes(tagId)) return item
      changed = true
      return stripTagFromEntity(item, tagId)
    })
    if (changed) await writeArray(LISTS_KEY, 'lists', next)
    return
  }

  if (type === 'paths') {
    const all = await readArray(PATHS_KEY, 'paths')
    let changed = false
    const next = all.map((item) => {
      if (item.ownerId !== uid || !(item.tagIds || []).includes(tagId)) return item
      changed = true
      return stripTagFromEntity(item, tagId)
    })
    if (changed) await writeArray(PATHS_KEY, 'paths', next)
    return
  }

  if (type === 'deals') {
    await mutatePipelines((all) => {
      let changed = false
      const next = all.map((pipeline) => {
        if (pipeline.ownerId !== uid || !Array.isArray(pipeline.deals)) return pipeline
        let pipeChanged = false
        const deals = pipeline.deals.map((deal) => {
          if (!(deal.tagIds || []).includes(tagId)) return deal
          pipeChanged = true
          return stripTagFromEntity(deal, tagId)
        })
        if (pipeChanged) {
          changed = true
          return { ...pipeline, deals }
        }
        return pipeline
      })
      return changed ? next : undefined
    })
  }
}

async function getRegistryForUser(uid) {
  if (!kvAvailable || !kv) return fallbackRegistry
  return loadTagRegistry(kv, uid)
}

async function setRegistryForUser(uid, registry) {
  const normalized = normalizeTagRegistry(registry)
  fallbackRegistry = normalized
  if (!kvAvailable || !kv) return normalized
  return saveTagRegistry(kv, uid, normalized)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {}, query = {} } = req
  const typeParam = query.type || body.type

  try {
    let registry = await getRegistryForUser(user.uid)

    if (method === 'GET') {
      if (typeParam && TAG_TYPES.includes(typeParam)) {
        return res.status(200).json({ tags: registry[typeParam], type: typeParam })
      }
      return res.status(200).json({ registry })
    }

    if (method === 'POST') {
      const { type, name, color } = body
      if (!type || !TAG_TYPES.includes(type)) {
        return res.status(400).json({ error: 'type must be one of: leads, deals, paths, lists' })
      }
      const trimmed = String(name || '').trim()
      if (!trimmed) return res.status(400).json({ error: 'Tag name is required' })
      if (trimmed.length > 40) return res.status(400).json({ error: 'Tag name is too long' })

      const existing = registry[type] || []
      const dup = existing.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
      if (dup) return res.status(409).json({ error: 'A tag with this name already exists', tag: dup })

      const tag = {
        id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: trimmed,
        color: typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)
          ? color
          : pickColor(existing.length),
        createdAt: new Date().toISOString(),
      }

      registry = { ...registry, [type]: [...existing, tag] }
      await setRegistryForUser(user.uid, registry)
      return res.status(201).json({ tag, type })
    }

    if (method === 'PATCH') {
      const { type, id, name, color } = body
      if (!type || !TAG_TYPES.includes(type)) {
        return res.status(400).json({ error: 'type must be one of: leads, deals, paths, lists' })
      }
      if (!id) return res.status(400).json({ error: 'id is required' })

      const list = registry[type] || []
      const idx = list.findIndex((t) => t.id === id)
      if (idx === -1) return res.status(404).json({ error: 'Tag not found' })

      const tag = { ...list[idx] }
      if (name !== undefined) {
        const trimmed = String(name || '').trim()
        if (!trimmed) return res.status(400).json({ error: 'Tag name cannot be empty' })
        const dup = list.find((t, i) => i !== idx && t.name.toLowerCase() === trimmed.toLowerCase())
        if (dup) return res.status(409).json({ error: 'A tag with this name already exists' })
        tag.name = trimmed
      }
      if (color !== undefined) {
        tag.color = typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)
          ? color
          : tag.color
      }

      const nextList = [...list]
      nextList[idx] = tag
      registry = { ...registry, [type]: nextList }
      await setRegistryForUser(user.uid, registry)
      return res.status(200).json({ tag, type })
    }

    if (method === 'DELETE') {
      const { type, id } = body
      if (!type || !TAG_TYPES.includes(type)) {
        return res.status(400).json({ error: 'type must be one of: leads, deals, paths, lists' })
      }
      if (!id) return res.status(400).json({ error: 'id is required' })

      const list = registry[type] || []
      if (!list.some((t) => t.id === id)) {
        return res.status(404).json({ error: 'Tag not found' })
      }

      registry = { ...registry, [type]: list.filter((t) => t.id !== id) }
      await setRegistryForUser(user.uid, registry)
      await sweepTagFromEntities(user.uid, type, id)
      return res.status(200).json({ message: 'Tag deleted', type, id })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('tags API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
