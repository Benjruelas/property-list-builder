/**
 * Server-backed team tasks — CRUD with assignment.
 * Team users store tasks in KV user_tasks; solo users keep local fallback on client.
 */

import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import { getAllTeams, fullTeamsIndex } from './lib/teams.js'
import { userHasTeamMembership } from './lib/access.js'
import { logTeamActivity, actorLabel } from './lib/activityLog.js'
import { taskVisibleToUser, canManageTask, sharedViewerMayPatch } from './lib/taskAccess.js'
import { paginateArray } from './lib/pagination.js'

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

const KV_KEY = 'user_tasks'
let fallbackStore = []

async function getAllTasks() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const rows = typeof data === 'string' ? (data ? JSON.parse(data) : []) : data
    const result = Array.isArray(rows) ? rows : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

async function saveAllTasks(tasks) {
  fallbackStore = tasks
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, tasks).catch(() => kv.set(KV_KEY, JSON.stringify(tasks)))
  } catch (e) {
    console.warn('tasks KV save failed', e.message)
  }
}

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch {
    return null
  }
}

function normalizeAssignedUids(body, existing, membership) {
  const raw = body.assignedUids !== undefined ? body.assignedUids : (existing?.assignedUids || [])
  const arr = Array.isArray(raw) ? [...new Set(raw.filter(Boolean))] : []
  return arr
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
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { method, body = {} } = req

  try {
    const allTeams = await getAllTeams()
    const membership = userHasTeamMembership(allTeams, user.uid)
    const all = await getAllTasks()

    if (method === 'GET') {
      const tasks = all.filter((t) => taskVisibleToUser(t, user, membership))
      // Opt-in cursor pagination (?limit=&cursor=) — full array without limit.
      const page = paginateArray(tasks, req.query || {})
      if (page.paginated) {
        return res.status(200).json({ tasks: page.items, nextCursor: page.nextCursor, teamId: membership?.id || null })
      }
      return res.status(200).json({ tasks, teamId: membership?.id || null })
    }

    if (!membership) {
      return res.status(400).json({ error: 'Team membership required for server tasks' })
    }

    if (method === 'POST') {
      const title = String(body.title || '').trim()
      if (!title) return res.status(400).json({ error: 'title is required' })
      let assignedUids
      try {
        assignedUids = normalizeAssignedUids(body, null, membership)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
      const now = new Date().toISOString()
      const task = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        title,
        ownerId: user.uid,
        ownerEmail: user.email,
        teamId: membership.id,
        visibility: body.visibility || 'team',
        sharedMemberUids: [],
        assignedUids,
        scheduledAt: body.scheduledAt || null,
        scheduledEndAt: body.scheduledEndAt || null,
        completed: false,
        completedAt: null,
        leadId: body.leadId || null,
        dealId: body.dealId || null,
        pipelineId: body.pipelineId || null,
        parcelId: body.parcelId || null,
        notes: body.notes ? String(body.notes).trim() || null : null,
        createdAt: now,
        updatedAt: now,
      }
      all.push(task)
      await saveAllTasks(all)

      const label = actorLabel(user)
      await logTeamActivity({
        teamIds: [membership.id],
        actor: user,
        type: 'task.created',
        summary: `${label} created task "${title}"`,
        entity: { kind: 'task', taskId: task.id },
        nav: { type: 'task', taskId: task.id },
        audience: 'resource_viewers',
      })

      try {
        const allTeams = await getAllTeams()
        const { notifyTaskAssigned } = await import('./push-utils.js')
        await notifyTaskAssigned(assignedUids.filter((uid) => uid !== user.uid), {
          taskTitle: title,
          taskId: task.id,
          actorEmail: user.email,
        }, fullTeamsIndex(allTeams))
      } catch {
        /* ignore */
      }

      return res.status(201).json({ task })
    }

    if (method === 'PATCH') {
      const { taskId } = body
      if (!taskId) return res.status(400).json({ error: 'taskId is required' })
      const idx = all.findIndex((t) => t.id === taskId)
      if (idx === -1) return res.status(404).json({ error: 'Task not found' })
      const task = all[idx]
      if (!taskVisibleToUser(task, user, membership)) {
        return res.status(403).json({ error: 'No access to this task' })
      }
      const isManager = canManageTask(task, user, membership)
      if (!isManager && !sharedViewerMayPatch(body)) {
        return res.status(403).json({ error: 'You can only mark this shared task complete or incomplete' })
      }
      if (isManager) {
        if (body.title !== undefined) task.title = String(body.title || '').trim() || task.title
        if (body.scheduledAt !== undefined) task.scheduledAt = body.scheduledAt
        if (body.scheduledEndAt !== undefined) task.scheduledEndAt = body.scheduledEndAt
        if (body.notes !== undefined) task.notes = String(body.notes || '').trim() || null
        if (body.assignedUids !== undefined) {
          const prevAssigned = new Set(task.assignedUids || [])
          try {
            task.assignedUids = normalizeAssignedUids(body, task, membership)
          } catch (e) {
            return res.status(400).json({ error: e.message })
          }
          const newlyAssigned = (task.assignedUids || []).filter(
            (uid) => uid !== user.uid && !prevAssigned.has(uid)
          )
          if (newlyAssigned.length) {
            try {
              const allTeams = await getAllTeams()
              const { notifyTaskAssigned } = await import('./push-utils.js')
              await notifyTaskAssigned(newlyAssigned, {
                taskTitle: task.title,
                taskId: task.id,
                actorEmail: user.email,
              }, fullTeamsIndex(allTeams))
            } catch {
              /* ignore */
            }
          }
        }
      }
      if (body.completed !== undefined) {
        task.completed = body.completed === true
        task.completedAt = task.completed ? new Date().toISOString() : null
      }
      task.updatedAt = new Date().toISOString()
      all[idx] = task
      await saveAllTasks(all)

      if (body.completed === true) {
        await logTeamActivity({
          teamIds: [membership.id],
          actor: user,
          type: 'task.completed',
          summary: `${actorLabel(user)} completed task "${task.title}"`,
          entity: { kind: 'task', taskId: task.id },
          nav: { type: 'task', taskId: task.id },
          audience: 'resource_viewers',
        })
      }

      return res.status(200).json({ task })
    }

    if (method === 'DELETE') {
      const { taskId } = body
      if (!taskId) return res.status(400).json({ error: 'taskId is required' })
      const idx = all.findIndex((t) => t.id === taskId)
      if (idx === -1) return res.status(404).json({ error: 'Task not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the task creator can delete it' })
      }
      all.splice(idx, 1)
      await saveAllTasks(all)
      return res.status(200).json({ message: 'Task deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('tasks API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
