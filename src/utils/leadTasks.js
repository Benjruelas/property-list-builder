/**
 * Lead tasks — stored in localStorage as a versioned flat list.
 * Each task: pipelineId (null = not scoped to a pipeline), parcelId (null = not tied to a lead).
 * Standalone: both null. Lead task: both set (when using API pipelines).
 */

import { loadTitle } from './dealPipeline'

const STORAGE_KEY = 'lead_tasks'

const LEGACY_UNASSIGNED = '__unassigned__'

function normalizeTask(t) {
  let createdAt = t.createdAt
  if (createdAt == null && t.id) {
    const parsed = parseInt(String(t.id).split('-')[1], 10)
    createdAt = Number.isFinite(parsed) ? parsed : Date.now()
  }
  if (createdAt == null) createdAt = Date.now()
  return {
    ...t,
    createdAt,
    completedAt: t.completedAt ?? null,
    scheduledAt: t.scheduledAt ?? null,
    scheduledEndAt: t.scheduledEndAt ?? null,
    pipelineId: t.pipelineId != null && t.pipelineId !== '' ? t.pipelineId : null,
    parcelId: t.parcelId != null && t.parcelId !== '' && t.parcelId !== LEGACY_UNASSIGNED ? t.parcelId : null
  }
}

function migrateLegacyKeyed(old) {
  const tasks = []
  for (const [key, taskList] of Object.entries(old)) {
    if (key === LEGACY_UNASSIGNED) {
      for (const t of taskList || []) {
        if (!(t.title ?? '').toString().trim() && !t.id) continue
        tasks.push(normalizeTask({ ...t, pipelineId: null, parcelId: null }))
      }
    } else {
      for (const t of taskList || []) {
        if (!(t.title ?? '').toString().trim() && !t.id) continue
        tasks.push(normalizeTask({ ...t, pipelineId: null, parcelId: key }))
      }
    }
  }
  return { v: 2, tasks }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { v: 2, tasks: [] }
    const parsed = JSON.parse(raw)
    if (parsed && parsed.v === 2 && Array.isArray(parsed.tasks)) {
      return { v: 2, tasks: parsed.tasks.map((t) => normalizeTask(t)) }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.v) {
      const migrated = migrateLegacyKeyed(parsed)
      saveStore(migrated)
      return migrated
    }
  } catch (e) {
    console.warn('leadTasks load failed', e)
  }
  return { v: 2, tasks: [] }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (e) {
    console.error('Error saving lead tasks:', e)
  }
}

function sortTasksFlat(arr) {
  return [...arr].sort((a, b) => {
    const aSched = a.scheduledAt ?? 0
    const bSched = b.scheduledAt ?? 0
    if (aSched && bSched) return aSched - bSched
    if (aSched) return -1
    if (bSched) return 1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

/**
 * Whether a task belongs to the active pipeline (for API mode).
 * Legacy tasks (pipelineId null, parcelId set) match if a lead in that pipeline has the parcel.
 */
export function taskBelongsToPipeline(task, activePipelineId, pipelines) {
  if (!activePipelineId) return false
  const standalone = task.pipelineId == null && task.parcelId == null
  if (standalone) return false

  if (task.pipelineId != null) {
    return task.pipelineId === activePipelineId
  }
  if (task.parcelId) {
    const pipe = pipelines.find((p) => p.id === activePipelineId)
    return pipe?.leads?.some((l) => l.parcelId === task.parcelId)
  }
  return false
}

/** Local single-pipeline mode: tasks tied to a lead in the list, or legacy parcel-only tasks. */
export function taskBelongsToLocalLeads(task, displayLeads) {
  const standalone = task.pipelineId == null && task.parcelId == null
  if (standalone) return false
  if (task.parcelId && displayLeads.some((l) => l.parcelId === task.parcelId)) return true
  return false
}

function firstPipelineForTask(task, pipelines) {
  if (task.pipelineId != null) {
    return pipelines.find((p) => p.id === task.pipelineId) ?? null
  }
  if (task.parcelId) {
    return pipelines.find((p) => p.leads?.some((l) => l.parcelId === task.parcelId)) ?? null
  }
  return null
}

/** Resolved deal pipeline for a task, or null if none (API pipelines only). */
export function getPipelineForTask(task, pipelines) {
  if (!pipelines?.length) return null
  return firstPipelineForTask(task, pipelines)
}

/**
 * Update a task by id (title, schedule, pipeline/lead assignment).
 */
export function updateTaskById(taskId, updates = {}) {
  if (!taskId) return
  const store = loadStore()
  const idx = store.tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) return
  const prev = store.tasks[idx]
  let t = { ...prev }
  if ('title' in updates && updates.title !== undefined) {
    t.title = String(updates.title ?? '').trim()
  }
  if ('scheduledAt' in updates) {
    t.scheduledAt = updates.scheduledAt && Number.isFinite(updates.scheduledAt) ? updates.scheduledAt : null
  }
  if ('scheduledEndAt' in updates) {
    t.scheduledEndAt =
      updates.scheduledEndAt !== undefined
        ? updates.scheduledEndAt && Number.isFinite(updates.scheduledEndAt)
          ? updates.scheduledEndAt
          : null
        : t.scheduledEndAt
  }
  if ('pipelineId' in updates) {
    t.pipelineId = updates.pipelineId != null && String(updates.pipelineId).trim() ? String(updates.pipelineId).trim() : null
  }
  if ('parcelId' in updates) {
    t.parcelId = updates.parcelId != null && String(updates.parcelId).trim() ? String(updates.parcelId).trim() : null
  }
  store.tasks[idx] = normalizeTask(t)
  saveStore(store)
}

function groupTasksByPipelineInternal(tasks, pipelines, completedOnly) {
  const filtered = tasks.filter((t) => {
    if (!(t.title ?? '').toString().trim()) return false
    return completedOnly ? !!t.completed : !t.completed
  })
  if (!pipelines || pipelines.length === 0) {
    const standalone = filtered.filter((t) => t.pipelineId == null && t.parcelId == null)
    const inLocal = filtered.filter((t) => !(t.pipelineId == null && t.parcelId == null))
    return {
      unlabeled: sortTasksFlat(standalone),
      groups: inLocal.length
        ? [{ pipeline: { id: '__local__', title: loadTitle() }, tasks: sortTasksFlat(inLocal) }]
        : []
    }
  }
  const unlabeled = []
  const byPipeId = new Map(pipelines.map((p) => [p.id, []]))
  for (const t of filtered) {
    const pipe = firstPipelineForTask(t, pipelines)
    if (!pipe) {
      unlabeled.push(t)
    } else {
      byPipeId.get(pipe.id).push(t)
    }
  }
  const groups = pipelines
    .map((p) => ({ pipeline: p, tasks: sortTasksFlat(byPipeId.get(p.id) || []) }))
    .filter((g) => g.tasks.length > 0)
  return { unlabeled: sortTasksFlat(unlabeled), groups }
}

/**
 * Incomplete tasks for the Tasks panel: unlabeled group first (not in any deal pipeline),
 * then one group per pipeline in `pipelines` array order.
 * Local mode (no API pipelines): unlabeled = standalone; one group titled from loadTitle().
 */
export function groupOpenTasksByPipeline(tasks, pipelines) {
  return groupTasksByPipelineInternal(tasks, pipelines, false)
}

/**
 * Completed tasks for the Tasks panel — same grouping as {@link groupOpenTasksByPipeline}.
 */
export function groupCompletedTasksByPipeline(tasks, pipelines) {
  return groupTasksByPipelineInternal(tasks, pipelines, true)
}

/**
 * Get all tasks (with pipelineId / parcelId). Omits empty placeholder tasks.
 */
export const getAllTasks = () => {
  const { tasks } = loadStore()
  const result = []
  for (const t of tasks) {
    if (!(t.title ?? '').toString().trim()) continue
    result.push(normalizeTask(t))
  }
  return sortTasksFlat(result)
}

/**
 * Tasks for a lead (optionally scoped to a pipeline).
 */
export const getLeadTasks = (parcelId, pipelineId = null) => {
  if (!parcelId) return []
  const { tasks } = loadStore()
  return sortTasksFlat(
    tasks
      .filter((t) => {
        if (t.parcelId !== parcelId) return false
        if (pipelineId == null) return true
        return t.pipelineId === pipelineId || (t.pipelineId == null && pipelineId != null)
      })
      .map(normalizeTask)
  )
}

function findTaskIndexById(taskId) {
  const store = loadStore()
  return store.tasks.findIndex((t) => t.id === taskId)
}

/**
 * Add a task (standalone when pipelineId and parcelId are both null).
 */
export const addTask = ({
  pipelineId = null,
  parcelId = null,
  title = '',
  scheduledAt = null,
  scheduledEndAt = null
} = {}) => {
  const store = loadStore()
  const now = Date.now()
  const task = normalizeTask({
    id: `task-${now}-${Math.random().toString(36).slice(2, 9)}`,
    title: (title ?? '').toString().trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null,
    scheduledEndAt: scheduledEndAt && Number.isFinite(scheduledEndAt) ? scheduledEndAt : null,
    pipelineId: pipelineId && String(pipelineId).trim() ? pipelineId : null,
    parcelId: parcelId && String(parcelId).trim() ? parcelId : null
  })
  store.tasks = [...store.tasks, task]
  saveStore(store)
  return task
}

/**
 * Legacy: addLeadTask(parcelId, title, scheduledAt, scheduledEndAt)
 * Or pass a single options object as first arg: { pipelineId, parcelId, title, ... }
 */
export const addLeadTask = (parcelId, title = '', scheduledAt = null, scheduledEndAt = null) => {
  if (parcelId && typeof parcelId === 'object' && !Array.isArray(parcelId)) {
    return addTask(parcelId)
  }
  const pid = parcelId && String(parcelId).trim() ? parcelId : null
  return addTask({ pipelineId: null, parcelId: pid, title, scheduledAt, scheduledEndAt })
}

export const updateLeadTaskTitle = (parcelId, taskId, title) => {
  if (!taskId) return
  const store = loadStore()
  const idx = store.tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) return
  store.tasks[idx] = { ...store.tasks[idx], title: (title ?? '').toString().trim() }
  saveStore(store)
}

export const updateLeadTaskSchedule = (parcelId, taskId, scheduledAt, scheduledEndAt = null) => {
  if (!taskId) return
  const store = loadStore()
  const idx = store.tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) return
  const t = store.tasks[idx]
  const updates = {
    scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null,
    scheduledEndAt:
      scheduledEndAt !== undefined
        ? scheduledEndAt && Number.isFinite(scheduledEndAt)
          ? scheduledEndAt
          : null
        : t.scheduledEndAt
  }
  store.tasks[idx] = { ...t, ...updates }
  saveStore(store)
}

/**
 * Bulk-insert tasks back into the store (used to restore tasks from a closed-lead snapshot).
 * Rewrites pipelineId/parcelId to the restoration targets. Preserves task ids and
 * completion state. Skips tasks that already exist in the store.
 */
export const restoreLeadTasks = (tasks, { parcelId = null, pipelineId = null } = {}) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return
  const store = loadStore()
  const existingIds = new Set(store.tasks.map((t) => t.id))
  const now = Date.now()
  for (const t of tasks) {
    if (!t || !(t.title ?? '').toString().trim()) continue
    const id = t.id && !existingIds.has(t.id) ? t.id : `task-${now}-${Math.random().toString(36).slice(2, 9)}`
    const rebuilt = normalizeTask({
      ...t,
      id,
      parcelId: parcelId && String(parcelId).trim() ? parcelId : null,
      pipelineId: pipelineId && String(pipelineId).trim() ? pipelineId : null
    })
    store.tasks.push(rebuilt)
    existingIds.add(id)
  }
  saveStore(store)
}

export const deleteLeadTask = (parcelId, taskId) => {
  if (!taskId) return
  const store = loadStore()
  store.tasks = store.tasks.filter((t) => t.id !== taskId)
  saveStore(store)
}

export const deleteTasksForPipeline = (pipelineId) => {
  if (!pipelineId) return
  const store = loadStore()
  store.tasks = store.tasks.filter((t) => t.pipelineId !== pipelineId)
  saveStore(store)
}

export const deleteAllLeadTasks = (parcelId, pipelineId = null) => {
  if (!parcelId) return
  const store = loadStore()
  store.tasks = store.tasks.filter((t) => {
    if (t.parcelId !== parcelId) return true
    if (pipelineId == null) return false
    return t.pipelineId !== pipelineId && t.pipelineId != null
  })
  saveStore(store)
}

export const toggleLeadTask = (parcelId, taskId) => {
  if (!taskId) return
  const store = loadStore()
  const idx = store.tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) return
  const now = Date.now()
  const t = store.tasks[idx]
  const completed = !t.completed
  store.tasks[idx] = {
    ...t,
    completed,
    completedAt: completed ? now : null
  }
  saveStore(store)
}

export const formatTaskTimeAgo = (ts) => {
  if (ts == null || !Number.isFinite(ts)) return ''
  const ms = Date.now() - ts
  const min = Math.floor(ms / 60000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatTaskCompletedDate = (ts) => {
  if (ts == null || !Number.isFinite(ts)) return ''
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatTaskScheduledDate = (ts) => {
  if (ts == null || !Number.isFinite(ts)) return ''
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

