/**
 * Utility for lead tasks - stored in localStorage keyed by parcelId
 * Tasks: { id, title, completed, createdAt, completedAt?, scheduledAt? }
 */

const STORAGE_KEY = 'lead_tasks'

function getAll() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    return JSON.parse(stored)
  } catch {
    return {}
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Error saving lead tasks:', e)
  }
}

/**
 * Get all tasks across all leads, with parcelId for each
 * @returns {Array<{id:string, title:string, completed:boolean, createdAt:number, completedAt?:number, parcelId:string}>}
 */
export const getAllTasks = () => {
  const all = getAll()
  const result = []
  for (const [parcelId, tasks] of Object.entries(all)) {
    for (const t of tasks || []) {
      if (!(t.title ?? '').toString().trim()) continue // only show tasks that have been created (non-empty title)
      let createdAt = t.createdAt
      if (createdAt == null && t.id) {
        const parsed = parseInt(t.id.split('-')[1], 10)
        createdAt = Number.isFinite(parsed) ? parsed : Date.now()
      }
      if (createdAt == null) createdAt = Date.now()
      result.push({ ...t, createdAt, completedAt: t.completedAt ?? null, scheduledAt: t.scheduledAt ?? null, parcelId })
    }
  }
  return result.sort((a, b) => {
    const aSched = a.scheduledAt ?? 0
    const bSched = b.scheduledAt ?? 0
    if (aSched && bSched) return aSched - bSched
    if (aSched) return -1
    if (bSched) return 1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

/**
 * Get tasks for a lead (by parcelId)
 * @param {string} parcelId - Parcel/lead ID
 * @returns {Array<{id:string, title:string, completed:boolean, createdAt:number, completedAt?:number}>}
 */
export const getLeadTasks = (parcelId) => {
  if (!parcelId) return []
  const raw = getAll()[parcelId] || []
  return raw.map((t) => {
    let createdAt = t.createdAt
    if (createdAt == null && t.id) {
      const parsed = parseInt(t.id.split('-')[1], 10)
      createdAt = Number.isFinite(parsed) ? parsed : Date.now()
    }
    if (createdAt == null) createdAt = Date.now()
    return { ...t, createdAt, completedAt: t.completedAt ?? null, scheduledAt: t.scheduledAt ?? null }
  })
}

/**
 * Add a task (title can be empty for new inline-edit flow)
 * @param {string} parcelId - Parcel/lead ID
 * @param {string} [title] - Task title (optional)
 * @param {number} [scheduledAt] - Optional scheduled timestamp (ms)
 * @returns {Object} The created task
 */
export const addLeadTask = (parcelId, title = '', scheduledAt = null) => {
  if (!parcelId) return null
  const all = getAll()
  const tasks = all[parcelId] || []
  const now = Date.now()
  const task = {
    id: `task-${now}-${Math.random().toString(36).slice(2, 9)}`,
    title: (title ?? '').toString().trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null
  }
  all[parcelId] = [...tasks, task]
  saveAll(all)
  return task
}

/**
 * Update a task's title
 * @param {string} parcelId - Parcel/lead ID
 * @param {string} taskId - Task ID
 * @param {string} title - New title
 */
export const updateLeadTaskTitle = (parcelId, taskId, title) => {
  if (!parcelId || !taskId) return
  const all = getAll()
  const tasks = all[parcelId] || []
  all[parcelId] = tasks.map((t) =>
    t.id === taskId ? { ...t, title: (title ?? '').toString().trim() } : t
  )
  saveAll(all)
}

/**
 * Update a task's scheduled date/time
 * @param {string} parcelId - Parcel/lead ID
 * @param {string} taskId - Task ID
 * @param {number|null} scheduledAt - Timestamp (ms) or null to unschedule
 */
export const updateLeadTaskSchedule = (parcelId, taskId, scheduledAt) => {
  if (!parcelId || !taskId) return
  const all = getAll()
  const tasks = all[parcelId] || []
  all[parcelId] = tasks.map((t) =>
    t.id === taskId ? { ...t, scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null } : t
  )
  saveAll(all)
}

/**
 * Delete a task
 * @param {string} parcelId - Parcel/lead ID
 * @param {string} taskId - Task ID
 */
export const deleteLeadTask = (parcelId, taskId) => {
  if (!parcelId || !taskId) return
  const all = getAll()
  const tasks = (all[parcelId] || []).filter((t) => t.id !== taskId)
  all[parcelId] = tasks
  saveAll(all)
}

/**
 * Toggle task completed state
 * @param {string} parcelId - Parcel/lead ID
 * @param {string} taskId - Task ID
 */
export const toggleLeadTask = (parcelId, taskId) => {
  if (!parcelId || !taskId) return
  const all = getAll()
  const tasks = all[parcelId] || []
  const now = Date.now()
  const updated = tasks.map((t) => {
    if (t.id !== taskId) return t
    const completed = !t.completed
    return {
      ...t,
      completed,
      completedAt: completed ? now : null
    }
  })
  all[parcelId] = updated
  saveAll(all)
}

/**
 * Format relative time (e.g. "5m ago", "2h ago", "3d ago")
 */
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

/**
 * Format completed date
 */
export const formatTaskCompletedDate = (ts) => {
  if (ts == null || !Number.isFinite(ts)) return ''
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format scheduled date/time for display
 */
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

/** Return yyyy-mm-ddThh:mm for datetime-local input */
export const toDatetimeLocal = (ts) => {
  if (ts == null || !Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse datetime-local value to timestamp */
export const fromDatetimeLocal = (str) => {
  if (!str || typeof str !== 'string') return null
  const ms = new Date(str).getTime()
  return Number.isFinite(ms) ? ms : null
}
