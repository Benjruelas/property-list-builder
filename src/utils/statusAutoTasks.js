/**
 * Client helpers for status auto-task templates (mirrors server normalizer).
 */

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

export function createDraftAutoTask(title = '') {
  return {
    id: `autotask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: String(title || '').trim(),
    dueDaysOffset: null,
    assignedUids: [],
  }
}
