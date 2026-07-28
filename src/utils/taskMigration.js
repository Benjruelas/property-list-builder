/**
 * One-time migration of embedded + local tasks into /api/tasks (KV user_tasks).
 */

import { getApiBase } from './apiBase'
import { getAllTasks as getLocalLeadTasks, deleteAllLeadTasks } from './leadTasks'
import { createTeamTask } from './tasks'
import { normalizeServerTask } from './taskCreateFlow'

const MIGRATION_KEY = 'tasks_unified_migration_v1'

function msToIso(v) {
  if (v == null) return null
  if (typeof v === 'string' && v.includes('T')) return v
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return new Date(n).toISOString()
}

export function isTasksMigrationComplete() {
  try {
    return localStorage.getItem(MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

function markTasksMigrationComplete() {
  try {
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch {
    /* ignore */
  }
}

async function migrateLocalTasks(getToken) {
  const local = getLocalLeadTasks()
  for (const t of local) {
    if (!(t?.title ?? '').toString().trim()) continue
    try {
      await createTeamTask(getToken, {
        title: String(t.title).trim(),
        scheduledAt: msToIso(t.scheduledAt),
        scheduledEndAt: msToIso(t.scheduledEndAt),
        leadId: t.leadId || null,
        dealId: t.dealId || null,
        pipelineId: t.pipelineId || null,
        parcelId: t.parcelId ? String(t.parcelId) : null,
        assignedUids: [],
        completed: !!t.completed,
        notes: t.notes || null,
        id: t.id,
      })
    } catch (e) {
      console.warn('local task migrate skip', t.id, e.message)
    }
  }
  if (local.length) deleteAllLeadTasks()
}

async function migrateEmbeddedTasks(getToken) {
  const token = await getToken()
  if (!token) return
  const res = await fetch(`${getApiBase()}/migrate-embedded-tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Migration failed (${res.status})`)
  }
  return res.json()
}

/** Idempotent — safe to call on every signed-in app load until flag is set. */
export async function ensureUnifiedTasks(getToken) {
  if (!getToken || isTasksMigrationComplete()) return
  await migrateLocalTasks(getToken)
  await migrateEmbeddedTasks(getToken)
  markTasksMigrationComplete()
}

export async function fetchAllServerTasks(getToken) {
  if (!getToken) return []
  await ensureUnifiedTasks(getToken)
  const { fetchTeamTasks } = await import('./tasks')
  const { tasks } = await fetchTeamTasks(getToken)
  return (tasks || []).map((t) => normalizeServerTask(t)).filter(Boolean)
}
