export const DEFAULT_LEAD_STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
  { id: 'lost', label: 'Lost' },
]

export function normalizeLeadStatuses(input) {
  const source = Array.isArray(input) ? input : []
  const byId = new Map(DEFAULT_LEAD_STATUSES.map((s) => [s.id, { ...s }]))

  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '').trim().toLowerCase()
    const label = String(raw.label || '').trim()
    if (!id || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) continue
    if (!label || label.length > 40) continue
    byId.set(id, { id, label })
  }

  const ordered = []
  for (const def of DEFAULT_LEAD_STATUSES) {
    if (byId.has(def.id)) ordered.push(byId.get(def.id))
  }
  for (const [id, row] of byId) {
    if (!DEFAULT_LEAD_STATUSES.some((d) => d.id === id)) ordered.push(row)
  }

  if (!ordered.some((s) => s.id === 'new')) {
    ordered.unshift({ id: 'new', label: 'New' })
  }
  if (!ordered.some((s) => s.id === 'converted')) {
    ordered.push({ id: 'converted', label: 'Converted' })
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
