/**
 * Vercel Serverless Function
 * User-scoped app data (deal pipeline, leads, tasks, parcel notes, skip traced, etc.).
 * Requires Firebase Auth (Bearer token).
 * - GET: Returns user's saved data blob
 * - PATCH: Accepts partial updates (merge into existing)
 *
 * Uses Vercel KV with key user_data_${uid}.
 * Set FIREBASE_API_KEY (Firebase Web API key) for token verification.
 */

import { authenticate } from './_lib/auth.js'
import { kv, kvAvailable } from './_lib/kvBootstrap.js'
import { withKvLock } from './_lib/kvLock.js'
import { getAllTeams } from './_lib/teams.js'
import { userHasTeamMembership } from './_lib/access.js'
import { normalizeLeadStatuses } from './_lib/leadStatuses.js'
import { normalizeDealStatuses } from './_lib/dealStatuses.js'
import { mutateLeads } from './_lib/leadStore.js'
import { mutatePipelines } from './_lib/pipelineStoreFull.js'

function kvKey(uid) {
  return `user_data_${uid}`
}

function lockKey(uid) {
  return `lock:user_data_${uid}`
}

async function getUserData(uid) {
  if (!kvAvailable || !kv) return null
  try {
    const data = await kv.get(kvKey(uid))
    if (!data) return null
    if (typeof data === 'string') return JSON.parse(data)
    return data
  } catch (e) {
    console.warn('KV get user_data failed', e.message)
    return null
  }
}

async function saveUserData(uid, data) {
  if (!kvAvailable || !kv) return
  try {
    await kv.set(kvKey(uid), JSON.stringify(data))
  } catch (e) {
    console.warn('KV save user_data failed', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  try {
    if (req.method === 'GET') {
      const data = await getUserData(user.uid)
      const version = Number(data?.__version) || 0
      return res.status(200).json({ data: data || {}, version })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const membership = userHasTeamMembership(await getAllTeams(), user.uid)
      const allowedKeys = [
        'dealPipelineColumns', 'dealPipelineLeads', 'dealPipelineTitle',
        'leadTasks', 'parcelNotes', 'skipTracedParcels', 'emailTemplates', 'textTemplates',
        'dealTemplates', 'skipTraceJobs', 'skipTracedList', 'appSettings', 'closedLeads'
      ]

      // Serialize the read-modify-write under a short lock so concurrent PATCHes
      // can't lose each other's field updates. When the client sends __baseVersion
      // and it doesn't match the server's current version, return 409 so the
      // client's mergeConflictKeepingLocalEdits path can reconcile offline edits.
      const applyMerge = async () => {
        const existing = await getUserData(user.uid) || {}
        const currentVersion = Number(existing.__version) || 0

        if (body.__baseVersion !== undefined && body.__baseVersion !== null && body.__baseVersion !== '') {
          const clientBase = Number(body.__baseVersion)
          if (Number.isFinite(clientBase) && clientBase !== currentVersion) {
            return {
              conflict: true,
              currentVersion,
              data: existing,
            }
          }
        }

        const merged = { ...existing }
        for (const key of allowedKeys) {
          if (key in body && body[key] !== undefined) {
            if (key === 'appSettings' && body.appSettings && typeof body.appSettings === 'object') {
              const nextSettings = { ...(existing.appSettings || {}), ...body.appSettings }
              if (membership) {
                nextSettings.leadStatuses = existing.appSettings?.leadStatuses || null
                nextSettings.dealStatuses = existing.appSettings?.dealStatuses || null
              } else {
                if (body.appSettings.leadStatuses !== undefined) {
                  nextSettings.leadStatuses = normalizeLeadStatuses(body.appSettings.leadStatuses)
                }
                if (body.appSettings.dealStatuses !== undefined) {
                  nextSettings.dealStatuses = normalizeDealStatuses(body.appSettings.dealStatuses)
                }
              }
              merged[key] = nextSettings
            } else {
              merged[key] = body[key]
            }
          }
        }
        merged.__version = currentVersion + 1
        await saveUserData(user.uid, merged)
        return { conflict: false, currentVersion: merged.__version, data: merged }
      }

      const locked = await withKvLock(lockKey(user.uid), applyMerge, { ttlMs: 5000, maxWaitMs: 3000 })
      const result = locked !== null ? locked : await applyMerge()

      if (result.conflict) {
        return res.status(409).json({
          error: 'Version conflict',
          version: result.currentVersion,
          data: result.data,
        })
      }

      if (!membership && body.appSettings?.leadStatuses !== undefined) {
        const statuses = normalizeLeadStatuses(result.data.appSettings?.leadStatuses)
        const valid = new Set(statuses.map((status) => status.id))
        const fallback = statuses[0]?.id || 'new'
        await mutateLeads((rows) => rows.map((lead) =>
          lead.ownerId === user.uid && !valid.has(lead.status)
            ? { ...lead, status: fallback, statusUpdatedAt: new Date().toISOString() }
            : lead
        ))
      }
      if (!membership && body.appSettings?.dealStatuses !== undefined) {
        const statuses = normalizeDealStatuses(result.data.appSettings?.dealStatuses)
        const valid = new Set(statuses.map((status) => status.id))
        const fallback = statuses[0]?.id || 'open'
        const columns = statuses.map(({ id, label }) => ({ id, name: label }))
        await mutatePipelines((rows) => rows.map((pipeline) => {
          if (pipeline.ownerId !== user.uid || pipeline.teamId) return pipeline
          return {
            ...pipeline,
            columns,
            deals: (pipeline.deals || []).map((deal) =>
              valid.has(deal.status)
                ? deal
                : { ...deal, status: fallback, statusEnteredAt: Date.now(), cumulativeTimeByStatus: {} }
            ),
            updatedAt: new Date().toISOString(),
          }
        }))
      }

      return res.status(200).json({ data: result.data, version: result.currentVersion })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('user-data API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
