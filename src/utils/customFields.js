/**
 * Client custom field definitions — normalize, resolve, draft helpers.
 */

export const CUSTOM_FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Dropdown' },
]

const TYPE_SET = new Set(CUSTOM_FIELD_TYPES.map((t) => t.id))

export function slugifyCustomFieldId(label, existingIds = new Set()) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'field'
  let id = base
  let n = 2
  while (existingIds.has(id)) {
    id = `${base}_${n}`
    n += 1
  }
  return id
}

export function normalizeCustomFieldDefs(input) {
  if (!Array.isArray(input)) return []
  const out = []
  const byId = new Map()

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    let id = String(raw.id || '').trim().toLowerCase()
    const label = String(raw.label || '').trim().slice(0, 60)
    if (!label) continue
    if (!id || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) {
      id = slugifyCustomFieldId(label, new Set(byId.keys()))
    }
    if (byId.has(id)) continue
    const type = TYPE_SET.has(String(raw.type || '').trim())
      ? String(raw.type).trim()
      : 'text'
    let options = []
    if (type === 'select') {
      const rawOpts = Array.isArray(raw.options) ? raw.options : []
      options = [...new Set(
        rawOpts
          .map((o) => String(o ?? '').trim().slice(0, 80))
          .filter(Boolean),
      )].slice(0, 50)
      if (options.length === 0) continue
    }
    const def = type === 'select'
      ? { id, label, type, options }
      : { id, label, type }
    byId.set(id, def)
    out.push(def)
    if (out.length >= 40) break
  }
  return out
}

export function resolveLeadCustomFields({ settings = null, teams = [], teamMembership = null } = {}) {
  if (teamMembership?.teamId) {
    const team = (teams || []).find((t) => t.id === teamMembership.teamId)
    const raw = team?.leadCustomFields?.length
      ? team.leadCustomFields
      : (teamMembership?.leadCustomFields?.length ? teamMembership.leadCustomFields : null)
    return normalizeCustomFieldDefs(raw || [])
  }
  if (settings?.leadCustomFields?.length) return normalizeCustomFieldDefs(settings.leadCustomFields)
  return []
}

export function resolveDealCustomFields({ settings = null, teams = [], teamMembership = null } = {}) {
  if (teamMembership?.teamId) {
    const team = (teams || []).find((t) => t.id === teamMembership.teamId)
    const raw = team?.dealCustomFields?.length
      ? team.dealCustomFields
      : (teamMembership?.dealCustomFields?.length ? teamMembership.dealCustomFields : null)
    return normalizeCustomFieldDefs(raw || [])
  }
  if (settings?.dealCustomFields?.length) return normalizeCustomFieldDefs(settings.dealCustomFields)
  return []
}

export function canEditLeadCustomFields(teamMembership) {
  return !teamMembership || teamMembership.role === 'admin'
}

export function canEditDealCustomFields(teamMembership) {
  return !teamMembership || teamMembership.role === 'admin'
}

export function createDraftCustomField(label, existing = [], type = 'text') {
  const ids = new Set(existing.map((f) => f.id))
  const cleanLabel = String(label || '').trim()
  const id = slugifyCustomFieldId(cleanLabel || 'field', ids)
  const t = TYPE_SET.has(type) ? type : 'text'
  if (t === 'select') {
    return { id, label: cleanLabel, type: 'select', options: [''] }
  }
  return { id, label: cleanLabel, type: t }
}

export function coerceCustomFieldValue(def, value) {
  if (value === undefined || value === null || value === '') return null
  if (!def) return null
  if (def.type === 'date') {
    const s = String(value).trim()
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!m) return null
    return m[1]
  }
  if (def.type === 'select') {
    const s = String(value).trim()
    if (!(def.options || []).includes(s)) return null
    return s
  }
  return String(value).trim().slice(0, 2000) || null
}

export function getCustomFieldValue(entity, fieldId) {
  const map = entity?.customFields
  if (!map || typeof map !== 'object') return null
  return map[fieldId] ?? null
}
