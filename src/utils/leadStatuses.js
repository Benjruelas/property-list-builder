/**
 * Lead status registry — defaults, normalization, and team/user resolution.
 */

export const DEFAULT_LEAD_STATUSES = [
  { id: 'new', label: 'New', color: 'bg-slate-500/25 text-slate-200 border-slate-400/40' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 text-blue-200 border-blue-400/40' },
  { id: 'qualified', label: 'Qualified', color: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  { id: 'converted', label: 'Converted', color: 'bg-green-500/20 text-green-200 border-green-400/40' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500/20 text-red-200 border-red-400/40' },
]

/** @deprecated use DEFAULT_LEAD_STATUSES */
export const LEAD_STATUSES = DEFAULT_LEAD_STATUSES

export const PROTECTED_LEAD_STATUS_IDS = new Set(['new', 'converted'])

const STATUS_COLOR_PALETTE = [
  'bg-slate-500/25 text-slate-200 border-slate-400/40',
  'bg-blue-500/20 text-blue-200 border-blue-400/40',
  'bg-amber-500/20 text-amber-200 border-amber-400/40',
  'bg-green-500/20 text-green-200 border-green-400/40',
  'bg-red-500/20 text-red-200 border-red-400/40',
  'bg-purple-500/20 text-purple-200 border-purple-400/40',
  'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  'bg-orange-500/20 text-orange-200 border-orange-400/40',
  'bg-pink-500/20 text-pink-200 border-pink-400/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
]

export function slugifyLeadStatusId(label, existingIds = new Set()) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'status'
  let id = base
  let n = 2
  while (existingIds.has(id)) {
    id = `${base}_${n}`
    n += 1
  }
  return id
}

export function normalizeLeadStatuses(input) {
  const source = Array.isArray(input) ? input : []
  const byId = new Map(DEFAULT_LEAD_STATUSES.map((s) => [s.id, { ...s }]))

  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '').trim().toLowerCase()
    const label = String(raw.label || '').trim()
    if (!id || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) continue
    if (!label || label.length > 40) continue
    const prev = byId.get(id) || {}
    const color = typeof raw.color === 'string' && raw.color.trim()
      ? raw.color.trim()
      : (prev.color || STATUS_COLOR_PALETTE[byId.size % STATUS_COLOR_PALETTE.length])
    byId.set(id, { id, label, color })
  }

  const ordered = []
  for (const def of DEFAULT_LEAD_STATUSES) {
    if (byId.has(def.id)) ordered.push(byId.get(def.id))
  }
  for (const [id, row] of byId) {
    if (!DEFAULT_LEAD_STATUSES.some((d) => d.id === id)) ordered.push(row)
  }

  if (!ordered.some((s) => s.id === 'new')) {
    ordered.unshift({ ...DEFAULT_LEAD_STATUSES[0] })
  }
  if (!ordered.some((s) => s.id === 'converted')) {
    const converted = DEFAULT_LEAD_STATUSES.find((s) => s.id === 'converted')
    if (converted) ordered.push({ ...converted })
  }

  return ordered
}

export function resolveLeadStatuses({ settings = null, teams = [], teamMembership = null } = {}) {
  if (teamMembership?.teamId) {
    const team = (teams || []).find((t) => t.id === teamMembership.teamId)
    const raw = team?.leadStatuses?.length
      ? team.leadStatuses
      : (teamMembership?.leadStatuses?.length ? teamMembership.leadStatuses : null)
    if (raw?.length) return normalizeLeadStatuses(raw)
    return normalizeLeadStatuses(DEFAULT_LEAD_STATUSES)
  }
  if (settings?.leadStatuses?.length) return normalizeLeadStatuses(settings.leadStatuses)
  return normalizeLeadStatuses(DEFAULT_LEAD_STATUSES)
}

/** First outreach status after New (defaults to Contacted when present). */
export function getPostContactStatusId(registry = DEFAULT_LEAD_STATUSES) {
  const list = registry?.length ? registry : DEFAULT_LEAD_STATUSES
  if (list.some((s) => s.id === 'contacted')) return 'contacted'
  const newIdx = list.findIndex((s) => s.id === 'new')
  if (newIdx >= 0) {
    for (let i = newIdx + 1; i < list.length; i += 1) {
      if (list[i].id !== 'converted') return list[i].id
    }
  }
  return list.find((s) => s.id !== 'new' && s.id !== 'converted')?.id || null
}

export function canEditLeadStatuses(teamMembership) {
  return !teamMembership || teamMembership.role === 'admin'
}

export function getLeadStatusMeta(statusId, registry = DEFAULT_LEAD_STATUSES) {
  const list = registry?.length ? registry : DEFAULT_LEAD_STATUSES
  return list.find((s) => s.id === statusId) || list[0] || DEFAULT_LEAD_STATUSES[0]
}

export function getLeadStatusIdSet(registry = DEFAULT_LEAD_STATUSES) {
  return new Set((registry?.length ? registry : DEFAULT_LEAD_STATUSES).map((s) => s.id))
}

/** Effective status. Deal creation explicitly writes `converted`; the board never derives state. */
export function getLeadStatus(lead, dealCount = 0, registry = DEFAULT_LEAD_STATUSES) {
  const ids = getLeadStatusIdSet(registry)
  if (!lead) return 'new'
  const raw = lead.status || 'new'
  return ids.has(raw) ? raw : (registry[0]?.id || 'new')
}

export function pickStatusColorForNew(existing = []) {
  const used = new Set(existing.map((s) => s.color))
  const next = STATUS_COLOR_PALETTE.find((c) => !used.has(c))
  return next || STATUS_COLOR_PALETTE[existing.length % STATUS_COLOR_PALETTE.length]
}

export function createDraftLeadStatus(label, existing = []) {
  const ids = new Set(existing.map((s) => s.id))
  const id = slugifyLeadStatusId(label, ids)
  return {
    id,
    label: label.trim(),
    color: pickStatusColorForNew(existing),
  }
}

export function canRemoveLeadStatus(statusId, registry) {
  if (PROTECTED_LEAD_STATUS_IDS.has(statusId)) return false
  return (registry?.length || 0) > 2
}
