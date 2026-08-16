import { normalizeAutoTaskTemplates } from './statusAutoTasks.js'

export const DEFAULT_DEAL_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending' },
  { id: 'closed', label: 'Closed' },
]

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
    const autoTasks = normalizeAutoTaskTemplates(raw.autoTasks)
    byId.set(id, { id, label, autoTasks })
  }

  if (!byId.has('open')) byId.set('open', { ...defaultsById.get('open'), autoTasks: [] })
  if (!byId.has('closed')) byId.set('closed', { ...defaultsById.get('closed'), autoTasks: [] })

  const ordered = [...byId.values()].filter((status) => status.id !== 'open' && status.id !== 'closed')
  ordered.unshift(byId.get('open'))
  ordered.push(byId.get('closed'))
  return ordered
}

export function resolveAllowedDealStatusIds(ctx, userAppSettings) {
  if (ctx?.team) {
    if (ctx.team.dealStatuses?.length) {
      return new Set(normalizeDealStatuses(ctx.team.dealStatuses).map((status) => status.id))
    }
    return new Set(DEFAULT_DEAL_STATUSES.map((status) => status.id))
  }
  if (userAppSettings?.dealStatuses?.length) {
    return new Set(normalizeDealStatuses(userAppSettings.dealStatuses).map((status) => status.id))
  }
  return new Set(DEFAULT_DEAL_STATUSES.map((status) => status.id))
}

export function isLegacyDealColumnId(statusId) {
  return /^col-\d+$/.test(String(statusId || ''))
}

export function normalizeDealStatusValue(value, existing, allowedIds) {
  if (value === undefined || value === null || value === '') {
    return existing?.status || 'open'
  }
  const status = String(value).trim()
  if (!allowedIds.has(status)) {
    throw new Error(`Invalid deal status: ${status}`)
  }
  return status
}

/**
 * Coerce a deal status into an allowed id.
 * Legacy `col-N` / empty values map to fallback; other unknown ids stay invalid (null).
 */
export function coerceDealStatus(value, allowedIds, fallback = 'open') {
  const status = String(value ?? '').trim()
  if (allowedIds.has(status)) return status
  if (!status || isLegacyDealColumnId(status)) {
    return allowedIds.has(fallback) ? fallback : ([...allowedIds][0] || 'open')
  }
  return null
}
