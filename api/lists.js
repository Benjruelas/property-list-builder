import { resolveDevBypassUser, isDevBypassToken } from './lib/devBypassUsers.js'
import {
  getAllTeams,
  fullTeamsIndex,
  resolveAccess
} from './lib/teams.js'

/**
 * Vercel Serverless Function - property lists. Firebase Bearer auth.
 *
 * - GET: lists owned by user, shared via email, or shared via team (teamShares)
 * - POST: create list (owner = current user)
 * - PATCH: owner may mutate any field (name, sharedWith, teamShares, parcels).
 *         Collaborators (email or team) may add/remove parcels only.
 * - DELETE: delete list (owner only)
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

const KV_KEY = 'user_lists'
let fallbackStore = []

async function getAllLists() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const lists = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(lists) ? lists : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllLists(lists) {
  fallbackStore = lists
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, lists).catch(() => kv.set(KV_KEY, JSON.stringify(lists)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
}

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function normalizeParcel(p) {
  if (typeof p === 'string') return { id: p, addedAt: new Date().toISOString() }
  if (p && p.id) {
    return {
      id: p.id,
      properties: p.properties || {},
      address: p.address || null,
      lat: p.lat || null,
      lng: p.lng || null,
      addedAt: p.addedAt || new Date().toISOString()
    }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const teamsIndex = fullTeamsIndex(allTeams)
      const lists = all.filter((l) => resolveAccess(l, user, teamsIndex) !== null)
      return res.status(200).json({ lists })
    }

    if (method === 'POST') {
      const { name, parcels = [] } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'List name is required' })
      }
      const newList = {
        id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim(),
        parcels: parcels.map(normalizeParcel).filter(Boolean),
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        teamShares: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const all = await getAllLists()
      all.push(newList)
      await saveAllLists(all)
      return res.status(201).json({ list: newList })
    }

    if (method === 'PATCH') {
      const { listId, parcels: newParcels, removeParcels, sharedWith, teamShares, name } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })

      const list = all[idx]
      const teamsIndex = fullTeamsIndex(allTeams)
      const access = resolveAccess(list, user, teamsIndex)
      if (!access) {
        return res.status(403).json({ error: 'You do not have access to this list' })
      }
      const isOwner = access === 'owner'

      // Collaborators may only touch parcels (add/remove). Everything else
      // requires owner - matches the normalized rights table in the plan.
      if (!isOwner) {
        if (name !== undefined || sharedWith !== undefined || teamShares !== undefined) {
          return res.status(403).json({ error: 'Only the list owner can change name or sharing' })
        }
        if (newParcels === undefined && removeParcels === undefined) {
          return res.status(400).json({ error: 'No permitted updates' })
        }
      }

      const prevSharedSet = new Set(
        (list.sharedWith || []).map((e) => (e || '').toLowerCase().trim()).filter(Boolean)
      )
      let newlyAddedListShares = []

      if (sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        if (uniqueEmails.length > 0) {
          const knownEmails = new Set()
          all.forEach((l) => {
            const o = (l.ownerEmail || '').toLowerCase().trim()
            if (o) knownEmails.add(o)
            ;(l.sharedWith || []).forEach((s) => {
              const t = (s || '').toLowerCase().trim()
              if (t) knownEmails.add(t)
            })
          })
          if (allowDevBypass && isDevBypassToken(idToken)) {
            // skip validation in dev
          } else {
            const unknown = uniqueEmails.filter((e) => !knownEmails.has(e))
            if (unknown.length > 0) {
              return res.status(400).json({ error: `No user found with email: ${unknown[0]}` })
            }
          }
        }
        newlyAddedListShares = uniqueEmails.filter((e) => !prevSharedSet.has(e))
        list.sharedWith = uniqueEmails
      }

      if (teamShares !== undefined) {
        const arr = Array.isArray(teamShares) ? teamShares : []
        const unique = [...new Set(arr.filter(Boolean))]
        // Each id must exist AND the patcher must own or be a member of it
        // (prevents leaking resources into teams they don't belong to).
        for (const tid of unique) {
          const team = teamsIndex[tid]
          if (!team) return res.status(400).json({ error: `Team not found: ${tid}` })
          const isMember =
            team.ownerId === user.uid ||
            (Array.isArray(team.members) && team.members.some((m) => m.uid === user.uid))
          if (!isMember) {
            return res.status(403).json({ error: 'You must be a member of each team you share with' })
          }
        }
        list.teamShares = unique
      }

      if (name !== undefined) {
        const trimmed = (name || '').trim()
        if (!trimmed) return res.status(400).json({ error: 'List name cannot be empty' })
        list.name = trimmed
      }

      if (removeParcels && Array.isArray(removeParcels)) {
        const ids = new Set(removeParcels)
        list.parcels = list.parcels.filter((p) => !ids.has(p.id || p))
      }
      if (newParcels && Array.isArray(newParcels)) {
        const existingIds = new Set((list.parcels || []).map((p) => p.id || p))
        const toAdd = newParcels.map(normalizeParcel).filter((p) => p && !existingIds.has(p.id))
        list.parcels = [...(list.parcels || []), ...toAdd]
      }

      list.updatedAt = new Date().toISOString()
      all[idx] = list
      await saveAllLists(all)

      if (isOwner && sharedWith !== undefined && newlyAddedListShares.length > 0) {
        try {
          const { notifyNewListShares } = await import('./push-utils.js')
          await notifyNewListShares(newlyAddedListShares, {
            listName: list.name,
            actorEmail: user.email
          })
        } catch (e) {
          console.warn('list push notify', e.message)
        }
      }

      return res.status(200).json({ list })
    }

    if (method === 'DELETE') {
      const { listId } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const all = await getAllLists()
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the list owner can delete this list' })
      }
      all.splice(idx, 1)
      await saveAllLists(all)
      return res.status(200).json({ message: 'List deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('lists API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
