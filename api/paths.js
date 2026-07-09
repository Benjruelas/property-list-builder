/**
 * Vercel Serverless Function
 * User-scoped GPS paths. Requires Firebase Auth (Bearer token).
 * - GET: Paths owned by user
 * - POST: Create path (owner = current user)
 * - PATCH: Rename path (owner only)
 * - DELETE: Delete path (owner only)
 *
 * Uses Vercel KV. Set FIREBASE_API_KEY (Firebase Web API key) for token verification.
 */

import { getAllTeams } from './lib/teams.js'
import { getAllPaths, saveAllPaths } from './lib/pathStore.js'
import { kv, kvAvailable } from './lib/kvBootstrap.js'
import { authenticate } from './lib/auth.js'
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllPaths(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const paths = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ paths })
    }

    if (method === 'POST') {
      const { name, points = [], distanceMiles = 0, city: cityRaw } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Path name is required' })
      }
      if (!Array.isArray(points) || points.length < 2) {
        return res.status(400).json({ error: 'Path must contain at least 2 points' })
      }
      const city =
        typeof cityRaw === 'string' ? cityRaw.trim().slice(0, 160) : ''
      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let tags = { tagIds: [], tagMeta: [] }
      try {
        tags = mergeEntityTags(body, null, tagRegistry, 'paths')
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
      const [all, allTeams] = await Promise.all([getAllPaths(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)

      let newPath = {
        id: `path_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim(),
        points,
        distanceMiles: typeof distanceMiles === 'number' ? distanceMiles : 0,
        city,
        tagIds: tags.tagIds,
        tagMeta: tags.tagMeta,
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        teamShares: [],
        teamId: null,
        visibility: 'private',
        sharedMemberUids: [],
        createdAt: new Date().toISOString()
      }

      if (body.sharedWith !== undefined) {
        const arr = Array.isArray(body.sharedWith) ? body.sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        newPath.sharedWith = [...new Set(emails)]
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
        newPath.teamShares = unique
      }

      if (body.visibility !== undefined || body.sharedMemberUids !== undefined) {
        try {
          const patched = applyResourceVisibilityPatch(newPath, body, ctx)
          newPath.visibility = patched.visibility
          newPath.teamId = patched.teamId
          newPath.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) newPath.teamShares = patched.teamShares
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      all.push(newPath)
      await saveAllPaths(all)

      try {
        const { runResourceShareNotifications } = await import('./lib/shareNotifications.js')
        await runResourceShareNotifications({
          resource: newPath,
          resourceType: 'path',
          nameField: 'name',
          newlyAddedEmails: newPath.sharedWith || [],
          newlyAddedTeamShares: newPath.teamShares || [],
          team: ctx.team,
          teamsIndex: ctx.teamsIndex,
          actor: user,
        })
      } catch (e) {
        console.warn('path create share notify', e.message)
      }

      return res.status(201).json({ path: newPath })
    }

    if (method === 'PATCH') {
      const { pathId, name, sharedWith, teamShares } = body
      if (!pathId) return res.status(400).json({ error: 'pathId is required' })

      const [all, allTeams] = await Promise.all([getAllPaths(), getAllTeams()])
      const idx = all.findIndex((p) => p.id === pathId)
      if (idx === -1) return res.status(404).json({ error: 'Path not found' })

      const path = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const access = getResourceAccess(path, user, ctx)
      if (!canEdit(access) && access !== 'admin_view') {
        return res.status(403).json({ error: 'No access to this path' })
      }
      if (access === 'admin_view') {
        return res.status(403).json({ error: 'Admins can view but not edit private paths' })
      }

      const canShare = canChangeVisibility(access)
      if (!canShare && (sharedWith !== undefined || teamShares !== undefined || body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        return res.status(403).json({ error: 'Only the path owner can change sharing' })
      }
      if (!canShare && name === undefined) {
        return res.status(400).json({ error: 'No permitted updates' })
      }

      const prevSharedMemberUids = [...(path.sharedMemberUids || [])]
      const prevSharedSet = new Set(
        (path.sharedWith || []).map((e) => (e || '').toLowerCase().trim()).filter(Boolean)
      )
      let newlyAddedPathShares = []
      const prevTeamShares = new Set(path.teamShares || [])
      let newlyAddedTeamShares = []

      if (name !== undefined && name.trim()) {
        path.name = name.trim()
      }

      if (canShare && sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map(e => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        newlyAddedPathShares = uniqueEmails.filter((e) => !prevSharedSet.has(e))
        path.sharedWith = uniqueEmails
      }

      if (canShare && teamShares !== undefined) {
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
        newlyAddedTeamShares = unique.filter((tid) => !prevTeamShares.has(tid))
        path.teamShares = unique
      }

      if (canShare && (body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        try {
          const patched = applyResourceVisibilityPatch(path, body, ctx)
          path.visibility = patched.visibility
          path.teamId = patched.teamId
          path.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) path.teamShares = patched.teamShares
          if (patched.visibility === 'team' && ctx.team?.id) {
            const { teamShareAddedOnVisibility } = await import('./lib/shareNotifications.js')
            newlyAddedTeamShares = [
              ...newlyAddedTeamShares,
              ...teamShareAddedOnVisibility(prevTeamShares, ctx.team.id),
            ]
          }
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      if (body.tagIds !== undefined || body.tagMeta !== undefined) {
        const tagRegistry = await loadTagRegistry(kv, user.uid)
        try {
          const tags = mergeEntityTags(body, path, tagRegistry, 'paths')
          path.tagIds = tags.tagIds
          path.tagMeta = tags.tagMeta
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      path.updatedAt = new Date().toISOString()
      all[idx] = path
      await saveAllPaths(all)

      if (canShare) {
        try {
          const { runResourceShareNotifications } = await import('./lib/shareNotifications.js')
          await runResourceShareNotifications({
            resource: path,
            resourceType: 'path',
            nameField: 'name',
            prevSharedMemberUids,
            newlyAddedEmails: newlyAddedPathShares,
            newlyAddedTeamShares,
            team: ctx.team,
            teamsIndex: ctx.teamsIndex,
            actor: user,
          })
        } catch (e) {
          console.warn('path push notify', e.message)
        }
      }

      try {
        const { logTeamActivity, actorLabel } = await import('./lib/activityLog.js')
        const label = actorLabel(user)
        for (const tid of newlyAddedTeamShares) {
          await logTeamActivity({
            teamIds: [tid],
            actor: user,
            type: 'path.shared',
            summary: `${label} shared path "${path.name}" with the team`,
            entity: { kind: 'path', pathId: path.id },
            nav: { type: 'path', pathId: path.id },
            audience: activityAudienceForResource(path),
          })
        }
      } catch (e) {
        console.warn('path activity log', e.message)
      }

      return res.status(200).json({ path })
    }

    if (method === 'DELETE') {
      const { pathId } = body
      if (!pathId) return res.status(400).json({ error: 'pathId is required' })

      const [all, allTeams] = await Promise.all([getAllPaths(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((p) => p.id === pathId)
      if (idx === -1) return res.status(404).json({ error: 'Path not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the path owner can delete this path' })
      }
      all.splice(idx, 1)
      await saveAllPaths(all)
      return res.status(200).json({ message: 'Path deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('paths API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
