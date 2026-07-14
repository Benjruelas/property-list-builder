/**
 * Deal status registry — defaults, normalization, and team/user resolution.
 */

export const DEFAULT_DEAL_STATUSES = [
  { id: 'open', label: 'Open', color: 'bg-slate-500/25 text-slate-200 border-slate-400/40' },
  { id: 'pending', label: 'Pending', color: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  { id: 'closed', label: 'Closed', color: 'bg-green-500/20 text-green-200 border-green-400/40' },
]

export const PROTECTED_DEAL_STATUS_IDS = new Set(['open', 'closed'])

const STATUS_COLOR_PALETTE = [
  'bg-slate-500/25 text-slate-200 border-slate-400/40',
  'bg-amber-500/20 text-amber-200 border-amber-400/40',
  'bg-green-500/20 text-green-200 border-green-400/40',
  'bg-blue-500/20 text-blue-200 border-blue-400/40',
  'bg-purple-500/20 text-purple-200 border-purple-400/40',
  'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  'bg-orange-500/20 text-orange-200 border-orange-400/40',
  'bg-pink-500/20 text-pink-200 border-pink-400/40',
  'bg-red-500/20 text-red-200 border-red-400/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
]

export function slugifyDealStatusId(label, existingIds = new Set()) {
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

export function normalizeDealStatuses(input) {
  const source = Array.isArray(input) ? input : []
  const defaultsById = new Map(DEFAULT_DEAL_STATUSES.map((status) => [status.id, status]))
  const byId = new Map()

  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '').trim().toLowerCase()
    const label = String(raw.label || '').trim()
    if (!id || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) continue
    if (!label || label.length > 40) continue
    const previous = byId.get(id) || defaultsById.get(id) || {}
    const color = typeof raw.color === 'string' && raw.color.trim()
      ? raw.color.trim()
      : (previous.color || STATUS_COLOR_PALETTE[byId.size % STATUS_COLOR_PALETTE.length])
    byId.set(id, { id, label, color })
  }

  if (!byId.has('open')) byId.set('open', { ...defaultsById.get('open') })
  if (!byId.has('closed')) byId.set('closed', { ...defaultsById.get('closed') })

  const ordered = [...byId.values()].filter((status) => status.id !== 'open' && status.id !== 'closed')
  ordered.unshift(byId.get('open'))
  ordered.push(byId.get('closed'))
  return ordered
}

export function resolveDealStatuses({ settings = null, teams = [], teamMembership = null } = {}) {
  if (teamMembership?.teamId) {
    const team = (teams || []).find((candidate) => candidate.id === teamMembership.teamId)
    const raw = team?.dealStatuses?.length
      ? team.dealStatuses
      : (teamMembership?.dealStatuses?.length ? teamMembership.dealStatuses : null)
    return normalizeDealStatuses(raw?.length ? raw : DEFAULT_DEAL_STATUSES)
  }
  return normalizeDealStatuses(
    settings?.dealStatuses?.length ? settings.dealStatuses : DEFAULT_DEAL_STATUSES,
  )
}

export function canEditDealStatuses(teamMembership) {
  return !teamMembership || teamMembership.role === 'admin'
}

export function getDealStatusMeta(statusId, registry = DEFAULT_DEAL_STATUSES) {
  const list = registry?.length ? registry : DEFAULT_DEAL_STATUSES
  return list.find((status) => status.id === statusId) || list[0] || DEFAULT_DEAL_STATUSES[0]
}

export function getDealStatusIdSet(registry = DEFAULT_DEAL_STATUSES) {
  return new Set((registry?.length ? registry : DEFAULT_DEAL_STATUSES).map((status) => status.id))
}

export function pickStatusColorForNew(existing = []) {
  const used = new Set(existing.map((status) => status.color))
  const next = STATUS_COLOR_PALETTE.find((color) => !used.has(color))
  return next || STATUS_COLOR_PALETTE[existing.length % STATUS_COLOR_PALETTE.length]
}

export function createDraftDealStatus(label, existing = []) {
  return {
    id: slugifyDealStatusId(label, new Set(existing.map((status) => status.id))),
    label: label.trim(),
    color: pickStatusColorForNew(existing),
  }
}

export function canRemoveDealStatus(statusId, registry) {
  if (PROTECTED_DEAL_STATUS_IDS.has(statusId)) return false
  return (registry?.length || 0) > 2
}
