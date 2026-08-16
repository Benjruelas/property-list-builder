/**
 * Status auto-task templates and once-per-status firing helpers.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function normalizeAutoTaskTemplates(input) {
  if (!Array.isArray(input)) return []
  const out = []
  const seen = new Set()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const title = String(raw.title || '').trim().slice(0, 200)
    if (!title) continue
    let id = String(raw.id || '').trim()
    if (!id) id = `autotask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    if (seen.has(id)) continue
    seen.add(id)
    let dueDaysOffset = null
    if (raw.dueDaysOffset !== undefined && raw.dueDaysOffset !== null && raw.dueDaysOffset !== '') {
      const n = Number(raw.dueDaysOffset)
      if (Number.isFinite(n) && n >= 0) dueDaysOffset = Math.min(Math.floor(n), 3650)
    }
    const assignedUids = Array.isArray(raw.assignedUids)
      ? [...new Set(raw.assignedUids.filter((uid) => typeof uid === 'string' && uid.trim()).map((uid) => uid.trim()))]
      : []
    out.push({ id, title, dueDaysOffset, assignedUids })
    if (out.length >= 20) break
  }
  return out
}

export function normalizeAutoTaskFiredStatusIds(input) {
  if (!Array.isArray(input)) return []
  const out = []
  const seen = new Set()
  for (const raw of input) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function scheduledAtFromDueDaysOffset(dueDaysOffset, nowMs = Date.now()) {
  if (dueDaysOffset === null || dueDaysOffset === undefined) return null
  const n = Number(dueDaysOffset)
  if (!Number.isFinite(n) || n < 0) return null
  return new Date(nowMs + Math.floor(n) * MS_PER_DAY).toISOString()
}

/**
 * Decide whether to fire auto-tasks for entering `nextStatus`.
 * Returns templates to create and the next fired-status id list.
 * Never re-fires for a status already in firedIds.
 */
export function planStatusAutoTasks({
  prevStatus = null,
  nextStatus = null,
  statusRegistry = [],
  firedStatusIds = [],
  nowMs = Date.now(),
} = {}) {
  const next = String(nextStatus || '').trim()
  const prev = prevStatus == null ? null : String(prevStatus || '').trim()
  const fired = normalizeAutoTaskFiredStatusIds(firedStatusIds)

  if (!next) {
    return { shouldFire: false, templates: [], tasksToCreate: [], nextFiredStatusIds: fired }
  }

  // Only fire on enter (status change or first create). Skip if unchanged.
  if (prev !== null && prev === next) {
    return { shouldFire: false, templates: [], tasksToCreate: [], nextFiredStatusIds: fired }
  }

  if (fired.includes(next)) {
    return { shouldFire: false, templates: [], tasksToCreate: [], nextFiredStatusIds: fired }
  }

  const statusMeta = (statusRegistry || []).find((s) => s && s.id === next)
  const templates = normalizeAutoTaskTemplates(statusMeta?.autoTasks)
  if (templates.length === 0) {
    // Nothing to create — still mark fired so returning later never re-evaluates empty→later-added
    // only if we want once-per-stage forever. Plan: once per stage visited. Mark even with empty
    // templates so later-added rules do not retro-fire on return (out of scope to re-run new rules).
    return {
      shouldFire: false,
      templates: [],
      tasksToCreate: [],
      nextFiredStatusIds: [...fired, next],
    }
  }

  const tasksToCreate = templates.map((t) => ({
    templateId: t.id,
    title: t.title,
    assignedUids: t.assignedUids,
    scheduledAt: scheduledAtFromDueDaysOffset(t.dueDaysOffset, nowMs),
    scheduledEndAt: null,
  }))

  return {
    shouldFire: true,
    templates,
    tasksToCreate,
    nextFiredStatusIds: [...fired, next],
  }
}
