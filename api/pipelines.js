import { resolveDevBypassUser, isDevBypassToken } from './lib/devBypassUsers.js'
import { getAllTeams } from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  isTeamAdmin,
} from './lib/resourceContext.js'

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

const KV_KEY = 'user_pipelines'
let fallbackStore = []

async function getAllPipelines() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const pipelines = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(pipelines) ? pipelines : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllPipelines(pipelines) {
  fallbackStore = pipelines
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, pipelines).catch(() => kv.set(KV_KEY, JSON.stringify(pipelines)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
}

/** Verify Firebase ID token; returns { uid, email } or null */
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

const DEFAULT_COLUMNS = [
  'Make Contact',
  'Roof Inspection',
  'File Claim',
  'Service Agreement',
  "Adjuster's Meeting",
  'Scope of Loss',
  'Appraisal',
  'Ready for Install',
  'Install Scheduled',
  'Installed',
]

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length === 0) {
    return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  }
  return cols.map((c, i) => ({
    id: (c && c.id) || `col-${i}`,
    name: (c && c.name) || ''
  })).filter(c => c.name)
}

function normalizePipelineDeals(pipeline) {
  if (!pipeline.deals && Array.isArray(pipeline.leads)) {
    pipeline.deals = []
    delete pipeline.leads
  }
  if (!Array.isArray(pipeline.deals)) pipeline.deals = []
  return pipeline
}

async function runPipelinePushNotifications({
  sharedWith,
  teamShares,
  deals,
  isOwner,
  pipeline,
  prevDealsSnapshot,
  newlyAddedPipelineShares,
  newlyAddedTeamShares,
  teamsIndex,
  user
}) {
  try {
    const {
      notifyNewPipelineShares,
      notifyPipelineDealStatusChanges,
      notifyTeamResourceShare,
      diffDealStatusChanges
    } = await import('./push-utils.js')
    if (sharedWith !== undefined && isOwner && newlyAddedPipelineShares.length > 0) {
      await notifyNewPipelineShares(newlyAddedPipelineShares, {
        pipelineTitle: pipeline.title,
        pipelineId: pipeline.id,
        actorEmail: user.email
      })
    }
    if (teamShares !== undefined && isOwner && newlyAddedTeamShares?.length > 0) {
      await notifyTeamResourceShare(newlyAddedTeamShares, teamsIndex, {
        resourceType: 'pipeline',
        resourceName: pipeline.title,
        resourceId: pipeline.id,
        actorEmail: user.email
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
    } = await import('./lib/activityLog.js')

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
      const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const pipelines = filterVisibleResources(all.map(normalizePipelineDeals), user, ctx)
      return res.status(200).json({ pipelines })
    }

    if (method === 'POST') {
      const { title = 'Deal Pipeline', columns, deals } = body
      const cols = normalizeColumns(columns)
      const dealsArr = Array.isArray(deals) ? deals : []
      const newPipeline = {
        id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        title: (title || 'Deal Pipeline').trim() || 'Deal Pipeline',
        columns: cols,
        deals: dealsArr,
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        teamShares: [],
        teamId: null,
        visibility: 'private',
        sharedMemberUids: [],
        isTeamPipe: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const all = await getAllPipelines()
      all.push(newPipeline)
      await saveAllPipelines(all)
      return res.status(201).json({ pipeline: newPipeline })
    }

    if (method === 'PATCH') {
      const { pipelineId, title, columns, deals, sharedWith, teamShares } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })

      const pipeline = normalizePipelineDeals(all[idx])
      const prevDealsSnapshot = JSON.parse(JSON.stringify(pipeline.deals || []))
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

      if (!canEdit(access) && access !== 'admin_view') {
        return res.status(403).json({ error: 'Only the pipeline owner or collaborators can update this pipeline' })
      }
      if (access === 'admin_view') {
        return res.status(403).json({ error: 'Admins can view but not edit private pipelines' })
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
        pipeline.deals = deals
      }
      delete pipeline.leads

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
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      pipeline.updatedAt = new Date().toISOString()
      all[idx] = pipeline
      await saveAllPipelines(all)

      await runPipelinePushNotifications({
        sharedWith,
        teamShares,
        deals,
        isOwner: canManageMeta,
        pipeline,
        prevDealsSnapshot,
        newlyAddedPipelineShares,
        newlyAddedTeamShares,
        teamsIndex,
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

      return res.status(200).json({ pipeline })
    }

    if (method === 'DELETE') {
      const { pipelineId } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })
      if (all[idx].isTeamPipe) {
        return res.status(403).json({ error: 'Team Pipe cannot be deleted' })
      }
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the pipeline owner can delete this pipeline' })
      }
      all.splice(idx, 1)
      await saveAllPipelines(all)
      return res.status(200).json({ message: 'Pipeline deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('pipelines API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
