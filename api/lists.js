import { isDevBypassToken } from './_lib/devBypassUsers.js'
import { getAllTeams } from './_lib/teams.js'
import { getAllLists, saveAllLists } from './_lib/listStore.js'
import { kv, kvAvailable } from './_lib/kvBootstrap.js'
import { authenticate } from './_lib/auth.js'
import { beginIdempotent, finishIdempotent } from './_lib/idempotency.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  activityAudienceForResource,
} from './_lib/resourceContext.js'
import { loadTagRegistry, mergeEntityTags } from './_lib/tagHelpers.js'
import { paginateArray } from './_lib/pagination.js'
import { normalizeParcel, parcelsToAdd } from './_lib/listParcels.js'

/**
 * Vercel Serverless Function - property lists. Firebase Bearer auth.
 *
 * - GET: lists owned by user, shared via email, or shared via team (teamShares)
 * - POST: create list (owner = current user)
 * - PATCH: owner may mutate any field (name, sharedWith, teamShares, parcels).
 *         Collaborators (email or team) may add/remove parcels only.
 * - DELETE: delete list (owner only)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user, allowDevBypass, idToken } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const lists = filterVisibleResources(all, user, ctx)
      // Opt-in cursor pagination (?limit=&cursor=) — full array without limit.
      const page = paginateArray(lists, req.query || {})
      if (page.paginated) {
        return res.status(200).json({ lists: page.items, nextCursor: page.nextCursor })
      }
      return res.status(200).json({ lists })
    }

    if (method === 'POST') {
      const { name, parcels = [] } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'List name is required' })
      }
      const idem = await beginIdempotent(req, res, 'lists')
      if (idem.replay) return
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
        const { runResourceShareNotifications } = await import('./_lib/shareNotifications.js')
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

      const createdBody = { list: newList }
      await finishIdempotent(idem.key, 201, createdBody)
      return res.status(201).json(createdBody)
    }

    if (method === 'PATCH') {
      const { listId, parcels: newParcels, removeParcels, sharedWith, teamShares, name } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })
      const idem = await beginIdempotent(req, res, 'lists')
      if (idem.replay) return

      const [all, allTeams] = await Promise.all([getAllLists(), getAllTeams()])
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })

      const list = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const access = getResourceAccess(list, user, ctx)
      if (!canEdit(access)) {
        return res.status(403).json({ error: 'You do not have access to this list' })
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
      const toAdd = parcelsToAdd(list.parcels, newParcels)
      if (toAdd.length > 0) {
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
          const { runResourceShareNotifications } = await import('./_lib/shareNotifications.js')
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
        const { logTeamActivity, actorLabel, teamIdsFromResource } = await import('./_lib/activityLog.js')
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
        if (teamIds.length > 0 && toAdd.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'list.parcel_added',
            delta: toAdd.length,
            summaryContext: { label, listName: list.name, count: toAdd.length },
            entity: { kind: 'list', listId: list.id, listName: list.name, count: toAdd.length },
            nav: { type: 'list', listId: list.id },
          })
        }
        if (teamIds.length > 0 && removeParcels && Array.isArray(removeParcels) && removeParcels.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'list.parcel_removed',
            delta: removeParcels.length,
            summaryContext: { label, listName: list.name, count: removeParcels.length },
            entity: { kind: 'list', listId: list.id, listName: list.name, count: removeParcels.length },
            nav: { type: 'list', listId: list.id },
          })
        }
      } catch (e) {
        console.warn('list activity log', e.message)
      }

      const patchedBody = { list }
      await finishIdempotent(idem.key, 200, patchedBody)
      return res.status(200).json(patchedBody)
    }

    if (method === 'DELETE') {
      const { listId } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })
      const idem = await beginIdempotent(req, res, 'lists')
      if (idem.replay) return

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
      const deletedBody = { message: 'List deleted' }
      await finishIdempotent(idem.key, 200, deletedBody)
      return res.status(200).json(deletedBody)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('lists API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
