import { authenticate } from './_lib/auth.js'
import { isDevBypassToken, isDevBypassAllowed } from './_lib/devBypassUsers.js'
import { getAllTeams } from './_lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  isTeamAdmin,
} from './_lib/resourceContext.js'
import { loadTagRegistry, mergeEntityTags, syncTagMetaToCollaborators, collectDealTagMetaFromPipeline, hydrateUserRegistryFromTagMeta, adoptTagMetaIntoUserRegistry } from './_lib/tagHelpers.js'
import { getAllPipelines, mutatePipelines } from './_lib/pipelineStoreFull.js'
import { isKvLockUnavailable, respondKvLockUnavailable } from './_lib/kvLockErrors.js'
import { getPipelinesForUser } from './_lib/pipelineRepo.js'
import { flags } from './_lib/flags.js'
import {
  DATAVER_PIPELINES,
  getUserDataVersion,
  parseIfNoneMatch,
} from './_lib/dataVersion.js'
import { kv, kvAvailable } from './_lib/kvBootstrap.js'
import { paginateArray } from './_lib/pagination.js'
import {
  DEFAULT_DEAL_STATUSES,
  normalizeDealStatuses,
  resolveAllowedDealStatusIds,
} from './_lib/dealStatuses.js'

/**
 * Vercel Serverless Function
 * User-scoped deal pipelines. Requires Firebase Auth (Bearer token).
 * - GET: Pipelines owned by user, shared with user's email, or shared with a team the user belongs to.
 * - POST: Create pipeline (owner = current user)
 * - PATCH: Owner = any field (title, columns, deals, sharedWith, teamShares). Collaborators (email or team) = deals only.
 * - DELETE: Delete pipeline (owner only)
 *
 * Uses Vercel KV. Set FIREBASE_API_KEY (Firebase Web API key) for token verification.
 */

const DEFAULT_COLUMNS = DEFAULT_DEAL_STATUSES.map((status) => status.label)

function statusesToColumns(statuses) {
  return normalizeDealStatuses(statuses).map(({ id, label }) => ({ id, name: label }))
}

async function loadUserAppSettings(uid) {
  if (!kvAvailable || !kv || !uid) return null
  try {
    const data = await kv.get(`user_data_${uid}`)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return parsed?.appSettings || null
  } catch {
    return null
  }
}

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length === 0) {
    return statusesToColumns(DEFAULT_DEAL_STATUSES)
  }
  return cols.map((c, i) => ({
    id: (c && c.id) || `col-${i}`,
    name: (c && c.name) || ''
  })).filter(c => c.name)
}

function normalizePipelineDeals(pipeline) {
  const p = { ...pipeline }
  if (!p.deals && Array.isArray(p.leads)) {
    const hasTeamTasks = p.leads.some(
      (l) => Array.isArray(l?.teamTasks) && l.teamTasks.length > 0
    )
    if (!hasTeamTasks) {
      p.deals = []
      delete p.leads
    } else {
      p.deals = []
    }
  }
  if (!Array.isArray(p.deals)) p.deals = []
  return p
}

async function runPipelinePushNotifications({
  sharedWith,
  teamShares,
  deals,
  isOwner,
  pipeline,
  prevDealsSnapshot,
  prevSharedMemberUids,
  newlyAddedPipelineShares,
  newlyAddedTeamShares,
  teamsIndex,
  team,
  user
}) {
  try {
    const { notifyPipelineDealStatusChanges, diffDealStatusChanges } = await import('./_lib/pushUtils.js')
    if (isOwner) {
      const { runResourceShareNotifications } = await import('./_lib/shareNotifications.js')
      await runResourceShareNotifications({
        resource: pipeline,
        resourceType: 'pipeline',
        nameField: 'title',
        prevSharedMemberUids,
        newlyAddedEmails: newlyAddedPipelineShares,
        newlyAddedTeamShares,
        team,
        teamsIndex,
        actor: user,
      })
    }
    if (deals !== undefined && Array.isArray(deals)) {
      const changes = diffDealStatusChanges(prevDealsSnapshot, pipeline.deals)
      if (changes.length > 0) {
        await notifyPipelineDealStatusChanges(changes, {
          pipelineTitle: pipeline.title,
          pipelineId: pipeline.id,
          columns: pipeline.columns || [],
          ownerEmail: pipeline.ownerEmail,
          sharedWith: pipeline.sharedWith || [],
          actorEmail: user.email
        })
      }
    }
  } catch (e) {
    console.warn('pipeline push notify', e.message)
  }
}

function columnName(columns, colId) {
  const col = (columns || []).find((c) => c.id === colId)
  return col?.name || colId || 'Unknown'
}

async function runPipelineActivityLog({
  pipeline,
  prevDealsSnapshot,
  newlyAddedTeamShares,
  teamsIndex,
  user,
  columns,
}) {
  try {
    const {
      logTeamActivity,
      actorLabel,
      teamIdsFromResource,
      diffDealChanges,
      dealActivityLabel,
    } = await import('./_lib/activityLog.js')

    const teamIds = teamIdsFromResource(pipeline)
    if (teamIds.length === 0) return

    const label = actorLabel(user)
    const pipeTitle = pipeline.title || 'pipeline'

    if (newlyAddedTeamShares?.length > 0) {
      for (const tid of newlyAddedTeamShares) {
        await logTeamActivity({
          teamIds: [tid],
          actor: user,
          type: 'pipeline.shared',
          summary: `${label} shared pipe "${pipeTitle}" with the team`,
          entity: { kind: 'pipeline', pipelineId: pipeline.id },
          nav: { type: 'pipeline', pipelineId: pipeline.id },
        })
      }
    }

    const dealChanges = diffDealChanges(prevDealsSnapshot, pipeline.deals)
    for (const change of dealChanges) {
      const dealLabel = dealActivityLabel(change.deal)
      if (change.type === 'deal.created') {
        await logTeamActivity({
          teamIds,
          actor: user,
          type: 'deal.created',
          summary: `${label} added deal "${dealLabel}" to ${pipeTitle}`,
          entity: { kind: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
          nav: { type: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
        })
      } else if (change.type === 'deal.moved') {
        const from = columnName(columns, change.oldStatus)
        const to = columnName(columns, change.newStatus)
        await logTeamActivity({
          teamIds,
          actor: user,
          type: 'deal.moved',
          summary: `${label} moved "${dealLabel}" from ${from} to ${to}`,
          entity: { kind: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
          nav: { type: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
        })
      } else if (change.type === 'deal.removed') {
        await logTeamActivity({
          teamIds,
          actor: user,
          type: 'deal.removed',
          summary: `${label} removed deal "${dealLabel}" from ${pipeTitle}`,
          entity: { kind: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
          nav: { type: 'deal', dealId: change.deal.id, pipelineId: pipeline.id },
        })
      }
    }
  } catch (e) {
    console.warn('pipeline activity log', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user, allowDevBypass, idToken } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      if (flags.VERSIONED_POLL()) {
        const clientVer = parseIfNoneMatch(req)
        const serverVer = await getUserDataVersion(DATAVER_PIPELINES, user.uid)
        if (clientVer && clientVer === serverVer) {
          res.setHeader('ETag', `"${serverVer}"`)
          return res.status(304).end()
        }
      }

      const [allTeams, userAppSettings] = await Promise.all([
        getAllTeams(),
        loadUserAppSettings(user.uid),
      ])
      const ctx = buildAccessContext(allTeams, user)
      const effectiveStatuses = ctx.team?.dealStatuses?.length
        ? ctx.team.dealStatuses
        : (ctx.team ? DEFAULT_DEAL_STATUSES : userAppSettings?.dealStatuses)
      const effectiveColumns = statusesToColumns(effectiveStatuses || DEFAULT_DEAL_STATUSES)
      const pipelines = (await getPipelinesForUser(user, ctx)).map((raw) => ({
        ...normalizePipelineDeals(raw),
        columns: effectiveColumns,
        title: 'Deals',
        canonicalType: 'deals',
      }))
      if (kvAvailable && kv) {
        const dealTagMeta = pipelines.flatMap((p) => collectDealTagMetaFromPipeline(p))
        const byId = new Map()
        for (const t of dealTagMeta) {
          if (t?.id && !byId.has(t.id)) byId.set(t.id, t)
        }
        await hydrateUserRegistryFromTagMeta(kv, user.uid, 'deals', [...byId.values()])
      }
      if (flags.VERSIONED_POLL()) {
        const serverVer = await getUserDataVersion(DATAVER_PIPELINES, user.uid)
        res.setHeader('ETag', `"${serverVer}"`)
      }
      // Opt-in cursor pagination (?limit=&cursor=) — full array without limit.
      const page = paginateArray(pipelines, req.query || {})
      if (page.paginated) {
        return res.status(200).json({ pipelines: page.items, nextCursor: page.nextCursor })
      }
      return res.status(200).json({ pipelines })
    }

    if (method === 'POST') {
      const { deals } = body
      const dealsArr = Array.isArray(deals) ? deals : []
      const [all, allTeams, userAppSettings] = await Promise.all([
        getAllPipelines(),
        getAllTeams(),
        loadUserAppSettings(user.uid),
      ])
      const ctx = buildAccessContext(allTeams, user)
      const existingCanonical = all.find((pipeline) =>
        pipeline.canonicalType === 'deals' &&
        (ctx.team ? pipeline.teamId === ctx.team.id : pipeline.ownerId === user.uid && !pipeline.teamId),
      )
      if (existingCanonical) return res.status(200).json({ pipeline: existingCanonical })
      const effectiveStatuses = ctx.team?.dealStatuses || userAppSettings?.dealStatuses || DEFAULT_DEAL_STATUSES
      const cols = statusesToColumns(effectiveStatuses)
      const allowedStatusIds = new Set(cols.map((column) => column.id))
      if (dealsArr.some((deal) => !allowedStatusIds.has(deal?.status || cols[0]?.id))) {
        return res.status(400).json({ error: 'Invalid deal status' })
      }

      let newPipeline = {
        id: ctx.team
          ? `pipe_team_${String(ctx.team.id).replace(/^team_/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`
          : `pipe_user_${String(user.uid).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        title: 'Deals',
        columns: cols,
        deals: dealsArr.map((deal) => ({ ...deal, status: deal.status || cols[0].id })),
        ownerId: ctx.team?.ownerId || user.uid,
        ownerEmail: ctx.team?.ownerEmail || user.email,
        sharedWith: [],
        teamShares: ctx.team ? [ctx.team.id] : [],
        teamId: ctx.team?.id || null,
        visibility: ctx.team ? 'team' : 'private',
        sharedMemberUids: [],
        isTeamPipe: Boolean(ctx.team),
        canonicalType: 'deals',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (body.sharedWith !== undefined) {
        const arr = Array.isArray(body.sharedWith) ? body.sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        newPipeline.sharedWith = uniqueEmails
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
        newPipeline.teamShares = unique
      }

      if (body.visibility !== undefined || body.sharedMemberUids !== undefined) {
        try {
          const patched = applyResourceVisibilityPatch(newPipeline, body, ctx)
          newPipeline.visibility = patched.visibility
          newPipeline.teamId = patched.teamId
          newPipeline.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) newPipeline.teamShares = patched.teamShares
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      await mutatePipelines((current) => [...current, newPipeline], {
        changedResources: [{ resource: newPipeline }],
      })

      try {
        const { runResourceShareNotifications } = await import('./_lib/shareNotifications.js')
        await runResourceShareNotifications({
          resource: newPipeline,
          resourceType: 'pipeline',
          nameField: 'title',
          newlyAddedEmails: newPipeline.sharedWith || [],
          newlyAddedTeamShares: newPipeline.teamShares || [],
          team: ctx.team,
          teamsIndex: ctx.teamsIndex,
          actor: user,
        })
      } catch (e) {
        console.warn('pipeline create share notify', e.message)
      }

      return res.status(201).json({ pipeline: newPipeline })
    }

    if (method === 'PATCH') {
      const { pipelineId, title, columns, deals, sharedWith, teamShares } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const [all, allTeams, userAppSettings] = await Promise.all([
        getAllPipelines(),
        getAllTeams(),
        loadUserAppSettings(user.uid),
      ])
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })

      const pipeline = normalizePipelineDeals(all[idx])
      const prevDealsSnapshot = JSON.parse(JSON.stringify(pipeline.deals || []))
      const prevSharedMemberUids = [...(pipeline.sharedMemberUids || [])]
      const prevVisibility = pipeline.visibility
      const prevTeamSharesSnapshot = [...(pipeline.teamShares || [])]
      const prevSharedSet = new Set(
        (pipeline.sharedWith || []).map((e) => (e || '').toLowerCase().trim()).filter(Boolean)
      )
      let newlyAddedPipelineShares = []
      const prevTeamShares = new Set(pipeline.teamShares || [])
      let newlyAddedTeamShares = []
      const ctx = buildAccessContext(allTeams, user)
      const teamsIndex = ctx.teamsIndex
      const access = getResourceAccess(pipeline, user, ctx)
      const pipeIsTeam = pipeline.isTeamPipe === true
      const canManageMeta = pipeIsTeam ? isTeamAdmin(ctx.team, user.uid) : canChangeVisibility(access)
      const allowedDealStatusIds = resolveAllowedDealStatusIds(ctx, userAppSettings)

      if (!canEdit(access) && access !== 'admin_view') {
        return res.status(403).json({ error: 'Only the pipeline owner or collaborators can update this pipeline' })
      }
      if (access === 'admin_view') {
        return res.status(403).json({ error: 'Admins can view but not edit private pipelines' })
      }
      if (pipeline.canonicalType === 'deals' &&
          (title !== undefined || columns !== undefined || sharedWith !== undefined ||
           teamShares !== undefined || body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        return res.status(403).json({ error: 'Deal pipe structure is managed in Settings' })
      }

      if (!canManageMeta) {
        if (title !== undefined || columns !== undefined || sharedWith !== undefined || teamShares !== undefined || body.visibility !== undefined || body.sharedMemberUids !== undefined) {
          return res.status(403).json({ error: pipeIsTeam ? 'Only team admins can change team Pipe settings' : 'Only the pipeline owner can change title, columns, or sharing' })
        }
        if (deals === undefined) {
          return res.status(400).json({ error: 'No permitted updates' })
        }
      }

      if (title !== undefined && canManageMeta) {
        pipeline.title = (title || 'Deal Pipeline').trim() || 'Deal Pipeline'
      }
      if (columns !== undefined && canManageMeta) {
        pipeline.columns = normalizeColumns(columns)
      }
      if (deals !== undefined && Array.isArray(deals)) {
        const invalidDeal = deals.find((deal) => !allowedDealStatusIds.has(String(deal?.status || '')))
        if (invalidDeal) {
          return res.status(400).json({ error: `Invalid deal status: ${invalidDeal.status || ''}` })
        }
        const tagRegistry = await loadTagRegistry(kv, user.uid)
        try {
          pipeline.deals = deals.map((incoming) => {
            const prevDeal = prevDealsSnapshot.find((d) => d.id === incoming.id) || {}
            const tags = mergeEntityTags(incoming, prevDeal, tagRegistry, 'deals')
            return { ...incoming, tagIds: tags.tagIds, tagMeta: tags.tagMeta }
          })
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }
      if (sharedWith !== undefined && canManageMeta) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        if (uniqueEmails.length > 0) {
          const knownEmails = new Set()
          all.forEach((p) => {
            const o = (p.ownerEmail || '').toLowerCase().trim()
            if (o) knownEmails.add(o)
            ;(p.sharedWith || []).forEach((s) => {
              const t = (s || '').toLowerCase().trim()
              if (t) knownEmails.add(t)
            })
          })
          // Also include list owners/shared for validation
          try {
            const listsData = kv.get ? await kv.get('user_lists') : null
            const lists = typeof listsData === 'string' ? (listsData ? JSON.parse(listsData) : []) : (listsData || [])
            ;(Array.isArray(lists) ? lists : []).forEach((l) => {
              const o = (l.ownerEmail || '').toLowerCase().trim()
              if (o) knownEmails.add(o)
              ;(l.sharedWith || []).forEach((s) => { const t = (s || '').toLowerCase().trim(); if (t) knownEmails.add(t) })
            })
          } catch {}
          if (!allowDevBypass || !isDevBypassToken(idToken)) {
            const unknown = uniqueEmails.filter((e) => !knownEmails.has(e))
            if (unknown.length > 0) {
              return res.status(400).json({ error: `No user found with email: ${unknown[0]}` })
            }
          }
        }
        newlyAddedPipelineShares = uniqueEmails.filter((e) => !prevSharedSet.has(e))
        pipeline.sharedWith = uniqueEmails
      }

      if (teamShares !== undefined && canManageMeta) {
        const arr = Array.isArray(teamShares) ? teamShares : []
        const unique = [...new Set(arr.filter(Boolean))]
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
        pipeline.teamShares = unique
        newlyAddedTeamShares = unique.filter((tid) => !prevTeamShares.has(tid))
      }

      if (canManageMeta && (body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        try {
          const patched = applyResourceVisibilityPatch(pipeline, body, ctx)
          pipeline.visibility = patched.visibility
          pipeline.teamId = patched.teamId
          pipeline.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) pipeline.teamShares = patched.teamShares
          if (patched.visibility === 'team' && ctx.team?.id) {
            const { teamShareAddedOnVisibility } = await import('./_lib/shareNotifications.js')
            newlyAddedTeamShares = [
              ...newlyAddedTeamShares,
              ...teamShareAddedOnVisibility(prevTeamShares, ctx.team.id),
            ]
          }
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      pipeline.updatedAt = new Date().toISOString()
      const prevPipeline = normalizePipelineDeals(all[idx])
      await mutatePipelines((current) => {
        const at = current.findIndex((p) => p.id === pipelineId)
        if (at === -1) return undefined
        const next = [...current]
        next[at] = pipeline
        return next
      }, { changedResources: [{ resource: pipeline, prevResource: prevPipeline }] })

      const dealTagMeta = collectDealTagMetaFromPipeline(pipeline)
      const sharingChanged =
        sharedWith !== undefined ||
        teamShares !== undefined ||
        body.visibility !== undefined ||
        body.sharedMemberUids !== undefined
      const visibilityChanged =
        pipeline.visibility !== prevVisibility ||
        JSON.stringify(pipeline.sharedMemberUids || []) !== JSON.stringify(prevSharedMemberUids) ||
        JSON.stringify(pipeline.teamShares || []) !== JSON.stringify(prevTeamSharesSnapshot)

      if (deals !== undefined && dealTagMeta.length > 0) {
        await syncTagMetaToCollaborators(kv, {
          resource: pipeline,
          type: 'deals',
          tagMeta: dealTagMeta,
          actorUid: user.uid,
          ctx,
        })
        await adoptTagMetaIntoUserRegistry(kv, user.uid, 'deals', dealTagMeta)
      } else if ((sharingChanged || visibilityChanged) && dealTagMeta.length > 0) {
        await syncTagMetaToCollaborators(kv, {
          resource: pipeline,
          type: 'deals',
          tagMeta: dealTagMeta,
          actorUid: user.uid,
          ctx,
        })
      }

      await runPipelinePushNotifications({
        sharedWith,
        teamShares,
        deals,
        isOwner: canManageMeta,
        pipeline,
        prevDealsSnapshot,
        prevSharedMemberUids,
        newlyAddedPipelineShares,
        newlyAddedTeamShares,
        teamsIndex,
        team: ctx.team,
        user
      })

      await runPipelineActivityLog({
        pipeline,
        prevDealsSnapshot,
        newlyAddedTeamShares,
        teamsIndex,
        user,
        columns: pipeline.columns || [],
      })

      const effectiveStatuses = ctx.team?.dealStatuses?.length
        ? ctx.team.dealStatuses
        : (ctx.team ? DEFAULT_DEAL_STATUSES : userAppSettings?.dealStatuses)
      return res.status(200).json({
        pipeline: {
          ...pipeline,
          columns: statusesToColumns(effectiveStatuses || DEFAULT_DEAL_STATUSES),
          title: pipeline.canonicalType === 'deals' ? 'Deals' : pipeline.title,
        },
      })
    }

    if (method === 'DELETE') {
      const { pipelineId } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })
      if (all[idx].canonicalType === 'deals') {
        return res.status(403).json({ error: 'The canonical Deal pipe cannot be deleted' })
      }
      if (all[idx].isTeamPipe) {
        return res.status(403).json({ error: 'Team Pipe cannot be deleted' })
      }
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the pipeline owner can delete this pipeline' })
      }
      const removed = all[idx]
      await mutatePipelines((current) => current.filter((p) => p.id !== pipelineId), {
        changedResources: [{ resource: null, prevResource: removed }],
      })
      const { removePipelineIndex } = await import('./_lib/pipelineRepo.js')
      await removePipelineIndex(pipelineId)
      return res.status(200).json({ message: 'Pipeline deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (isKvLockUnavailable(err)) return respondKvLockUnavailable(res, err)
    console.error('pipelines API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
