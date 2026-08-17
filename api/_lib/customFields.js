/**
 * Custom field definitions and value normalization for leads/deals.
 */

export const CUSTOM_FIELD_TYPES = new Set(['text', 'date', 'select'])

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
    const type = CUSTOM_FIELD_TYPES.has(String(raw.type || '').trim())
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

export function resolveCustomFieldDefs(scope, { team = null, teamMembership = null, settings = null } = {}) {
  const key = scope === 'deals' ? 'dealCustomFields' : 'leadCustomFields'
  if (teamMembership?.teamId || team) {
    const raw = team?.[key]?.length
      ? team[key]
      : (teamMembership?.[key]?.length ? teamMembership[key] : null)
    return normalizeCustomFieldDefs(raw || [])
  }
  if (settings?.[key]?.length) return normalizeCustomFieldDefs(settings[key])
  return []
}

export function coerceCustomFieldValue(def, value) {
  if (value === undefined || value === null || value === '') return null
  if (!def) return null
  if (def.type === 'date') {
    const s = String(value).trim()
    // Accept YYYY-MM-DD or ISO datetime; store date portion.
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!m) return null
    return m[1]
  }
  if (def.type === 'select') {
    const s = String(value).trim()
    if (!(def.options || []).includes(s)) return null
    return s
  }
  // text
  return String(value).trim().slice(0, 2000) || null
}

/**
 * Normalize a customFields map against field definitions.
 * Unknown keys are dropped. Missing defs → empty object.
 */
export function normalizeCustomFieldValues(rawValues, defs) {
  const definitions = normalizeCustomFieldDefs(defs)
  if (definitions.length === 0) return {}
  const source = rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? rawValues
    : {}
  const out = {}
  for (const def of definitions) {
    if (!(def.id in source)) continue
    const coerced = coerceCustomFieldValue(def, source[def.id])
    if (coerced !== null) out[def.id] = coerced
  }
  return out
}

/**
 * Merge body.customFields over existing, constrained to defs.
 * If body.customFields is undefined, preserve existing values (filtered to current defs).
 */
export function mergeCustomFieldValues(bodyValues, existingValues, defs) {
  const definitions = normalizeCustomFieldDefs(defs)
  if (bodyValues === undefined) {
    return normalizeCustomFieldValues(existingValues, definitions)
  }
  const existing = existingValues && typeof existingValues === 'object' ? existingValues : {}
  const incoming = bodyValues && typeof bodyValues === 'object' && !Array.isArray(bodyValues)
    ? bodyValues
    : {}
  const merged = { ...existing, ...incoming }
  // Explicit null clears a field
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null) merged[k] = null
  }
  return normalizeCustomFieldValues(merged, definitions)
}
