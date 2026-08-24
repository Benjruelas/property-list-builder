import { normalizeAutoTaskTemplates } from './statusAutoTasks.js'
import { STATUS_COLOR_PALETTE, resolveStatusColor } from './statusColorPalette.js'

export const DEFAULT_LEAD_STATUSES = [
  { id: 'new', label: 'New', color: STATUS_COLOR_PALETTE[0] },
  { id: 'contacted', label: 'Contacted', color: STATUS_COLOR_PALETTE[1] },
  { id: 'qualified', label: 'Qualified', color: STATUS_COLOR_PALETTE[2] },
  { id: 'converted', label: 'Converted', color: STATUS_COLOR_PALETTE[3] },
  { id: 'lost', label: 'Lost', color: STATUS_COLOR_PALETTE[4] },
]

export function normalizeLeadStatuses(input) {
  const source = Array.isArray(input) ? input : []
  if (source.length === 0) return DEFAULT_LEAD_STATUSES.map((status) => ({ ...status, autoTasks: [] }))
  const defaultsById = new Map(DEFAULT_LEAD_STATUSES.map((status) => [status.id, status]))
  const byId = new Map()

  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '').trim().toLowerCase()
    const label = String(raw.label || '').trim()
    if (!id || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) continue
    if (!label || label.length > 40) continue
    const prev = byId.get(id) || defaultsById.get(id) || {}
    const fallback = prev.color || STATUS_COLOR_PALETTE[byId.size % STATUS_COLOR_PALETTE.length]
    const color = resolveStatusColor(raw.color, fallback)
    const autoTasks = normalizeAutoTaskTemplates(raw.autoTasks)
    byId.set(id, { id, label, color, autoTasks })
  }

  const ordered = [...byId.values()]

  if (!ordered.some((s) => s.id === 'new')) {
    ordered.unshift({ ...defaultsById.get('new'), autoTasks: [] })
  }
  if (!ordered.some((s) => s.id === 'converted')) {
    ordered.push({ ...defaultsById.get('converted'), autoTasks: [] })
  }

  return ordered
}

export function resolveAllowedLeadStatusIds(ctx, userAppSettings) {
  if (ctx?.team) {
    if (ctx.team.leadStatuses?.length) {
      return new Set(normalizeLeadStatuses(ctx.team.leadStatuses).map((s) => s.id))
    }
    return new Set(DEFAULT_LEAD_STATUSES.map((s) => s.id))
  }
  if (userAppSettings?.leadStatuses?.length) {
    return new Set(normalizeLeadStatuses(userAppSettings.leadStatuses).map((s) => s.id))
  }
  return new Set(DEFAULT_LEAD_STATUSES.map((s) => s.id))
}

export function normalizeLeadStatusValue(value, existing, allowedIds) {
  if (value === undefined || value === null || value === '') {
    return existing?.status || 'new'
  }
  const status = String(value).trim()
  if (!allowedIds.has(status)) {
    throw new Error(`Invalid lead status: ${status}`)
  }
  return status
}
