import {resolveDevBypassUser, isDevBypassToken, isDevBypassAllowed} from './lib/devBypassUsers.js'
import { getAllTeams } from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  activityAudienceForResource,
} from './lib/resourceContext.js'
import { loadTagRegistry, mergeEntityTags } from './lib/tagHelpers.js'

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
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const lists = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ lists })
    }

    if (method === 'POST') {
      const { name, parcels = [] } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'List name is required' })
      }
      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)

      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let tags = { tagIds: [], tagMeta: [] }
      try {
        tags = mergeEntityTags(body, null, tagRegistry, 'lists')
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      let newList = {
        id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim(),
        parcels: parcels.map(normalizeParcel).filter(Boolean),
        tagIds: tags.tagIds,
        tagMeta: tags.tagMeta,
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        teamShares: [],
        teamId: null,
        visibility: 'private',
        sharedMemberUids: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (body.sharedWith !== undefined) {
        const arr = Array.isArray(body.sharedWith) ? body.sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        newList.sharedWith = uniqueEmails
      }

      if (body.teamShares !== undefined) {
        const arr = Array.isArray(body.teamShares) ? body.teamShares : []
        const unique = [...new Set(arr.filter(Boolean))]
        for (const tid of unique) {
          const team = ctx.teamsIndex[tid]
          if (!team) return res.status(400).json({ error: `Team not found: ${tid}` })
          const isMember =
            team.ownerId === user.uid ||
            (Array.isArray(team.members) && team.members.some((m) => m.uid === user.uid))
          if (!isMember) {
            return res.status(403).json({ error: 'You must be a member of each team you share with' })
          }
        }
        newList.teamShares = unique
      }

      if (body.visibility !== undefined || body.sharedMemberUids !== undefined) {
        try {
          const patched = applyResourceVisibilityPatch(newList, body, ctx)
          newList.visibility = patched.visibility
          newList.teamId = patched.teamId
          newList.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) newList.teamShares = patched.teamShares
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      all.push(newList)
      await saveAllLists(all)

      try {
        const { runResourceShareNotifications } = await import('./lib/shareNotifications.js')
        await runResourceShareNotifications({
          resource: newList,
          resourceType: 'list',
          nameField: 'name',
          newlyAddedEmails: newList.sharedWith || [],
          newlyAddedTeamShares: newList.teamShares || [],
          team: ctx.team,
          teamsIndex: ctx.teamsIndex,
          actor: user,
        })
      } catch (e) {
        console.warn('list create share notify', e.message)
      }

      return res.status(201).json({ list: newList })
    }

    if (method === 'PATCH') {
      const { listId, parcels: newParcels, removeParcels, sharedWith, teamShares, name } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })

      const list = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const access = getResourceAccess(list, user, ctx)
      if (!canEdit(access) && access !== 'admin_view') {
        return res.status(403).json({ error: 'You do not have access to this list' })
      }
      if (access === 'admin_view') {
        return res.status(403).json({ error: 'Admins can view but not edit private lists' })
      }
      const isOwner = canChangeVisibility(access)

      if (!isOwner) {
        if (name !== undefined || sharedWith !== undefined || teamShares !== undefined || body.visibility !== undefined || body.sharedMemberUids !== undefined) {
          return res.status(403).json({ error: 'Only the list owner can change name or sharing' })
        }
        if (newParcels === undefined && removeParcels === undefined) {
          return res.status(400).json({ error: 'No permitted updates' })
        }
      }

      const prevSharedMemberUids = [...(list.sharedMemberUids || [])]
      const prevSharedSet = new Set(
        (list.sharedWith || []).map((e) => (e || '').toLowerCase().trim()).filter(Boolean)
      )
      let newlyAddedListShares = []
      const prevTeamShares = new Set(list.teamShares || [])
      let newlyAddedTeamShares = []

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
        for (const tid of unique) {
          const team = ctx.teamsIndex[tid]
          if (!team) return res.status(400).json({ error: `Team not found: ${tid}` })
          const isMember =
            team.ownerId === user.uid ||
            (Array.isArray(team.members) && team.members.some((m) => m.uid === user.uid))
          if (!isMember) {
            return res.status(403).json({ error: 'You must be a member of each team you share with' })
          }
        }
        list.teamShares = unique
        newlyAddedTeamShares = unique.filter((tid) => !prevTeamShares.has(tid))
      }

      if (body.visibility !== undefined || body.sharedMemberUids !== undefined) {
        try {
          const patched = applyResourceVisibilityPatch(list, body, ctx)
          list.visibility = patched.visibility
          list.teamId = patched.teamId
          list.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) list.teamShares = patched.teamShares
          if (patched.visibility === 'team' && ctx.team?.id) {
            newlyAddedTeamShares = prevTeamShares.has(ctx.team.id) ? newlyAddedTeamShares : [...newlyAddedTeamShares, ctx.team.id]
          }
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
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

      if (body.tagIds !== undefined || body.tagMeta !== undefined) {
        const tagRegistry = await loadTagRegistry(kv, user.uid)
        try {
          const tags = mergeEntityTags(body, list, tagRegistry, 'lists')
          list.tagIds = tags.tagIds
          list.tagMeta = tags.tagMeta
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      list.updatedAt = new Date().toISOString()
      all[idx] = list
      await saveAllLists(all)

      if (isOwner) {
        try {
          const { runResourceShareNotifications } = await import('./lib/shareNotifications.js')
          await runResourceShareNotifications({
            resource: list,
            resourceType: 'list',
            nameField: 'name',
            prevSharedMemberUids,
            newlyAddedEmails: newlyAddedListShares,
            newlyAddedTeamShares,
            team: ctx.team,
            teamsIndex: ctx.teamsIndex,
            actor: user,
          })
        } catch (e) {
          console.warn('list push notify', e.message)
        }
      }

      try {
        const { logTeamActivity, actorLabel, teamIdsFromResource } = await import('./lib/activityLog.js')
        const teamIds = teamIdsFromResource(list)
        const label = actorLabel(user)
        if (newlyAddedTeamShares.length > 0) {
          for (const tid of newlyAddedTeamShares) {
            await logTeamActivity({
              teamIds: [tid],
              actor: user,
              type: 'list.shared',
              summary: `${label} shared list "${list.name}" with the team`,
              entity: { kind: 'list', listId: list.id },
              nav: { type: 'list', listId: list.id },
              audience: activityAudienceForResource(list),
            })
          }
        }
        if (teamIds.length > 0 && newParcels && Array.isArray(newParcels) && newParcels.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'list.parcel_added',
            summary: `${label} added ${newParcels.length} parcel${newParcels.length === 1 ? '' : 's'} to "${list.name}"`,
            entity: { kind: 'list', listId: list.id },
            nav: { type: 'list', listId: list.id },
          })
        }
        if (teamIds.length > 0 && removeParcels && Array.isArray(removeParcels) && removeParcels.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'list.parcel_removed',
            summary: `${label} removed ${removeParcels.length} parcel${removeParcels.length === 1 ? '' : 's'} from "${list.name}"`,
            entity: { kind: 'list', listId: list.id },
            nav: { type: 'list', listId: list.id },
          })
        }
      } catch (e) {
        console.warn('list activity log', e.message)
      }

      return res.status(200).json({ list })
    }

    if (method === 'DELETE') {
      const { listId } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
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
