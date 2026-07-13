/**
 * Canonical R2 keys for form template PDFs.
 * Only keys under forms/{ownerId}/{templateId}/ are valid.
 */

const CANONICAL_SUFFIX = '/original.pdf'

export function canonicalFormPdfKey(ownerId, templateId) {
  const uid = sanitizePathSegment(ownerId)
  const tid = sanitizePathSegment(templateId)
  if (!uid || !tid) return null
  return `forms/${uid}/${tid}${CANONICAL_SUFFIX}`
}

export function sanitizePathSegment(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80)
}

/**
 * Returns the key if it matches the canonical path for this owner/template.
 */
export function assertCanonicalFormPdfKey(key, ownerId, templateId) {
  const canonical = canonicalFormPdfKey(ownerId, templateId)
  if (!canonical) return null
  const normalized = String(key || '').trim()
  if (normalized !== canonical) return null
  return canonical
}

/**
 * True when key is a well-formed forms/* path (used for coarse rejection).
 */
export function isWellFormedFormPdfKey(key) {
  const parts = String(key || '').split('/')
  if (parts.length !== 4 || parts[0] !== 'forms' || parts[3] !== 'original.pdf') return false
  return sanitizePathSegment(parts[1]) === parts[1] && sanitizePathSegment(parts[2]) === parts[2]
}
