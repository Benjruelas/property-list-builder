/**
 * Canonical R2 keys for form template PDFs and completed submissions.
 * Template: forms/{ownerId}/{templateId}/original.pdf
 * Submission: forms/{ownerId}/{templateId}/submissions/{submissionId}.pdf
 */

const CANONICAL_SUFFIX = '/original.pdf'

export function canonicalFormPdfKey(ownerId, templateId) {
  const uid = sanitizePathSegment(ownerId)
  const tid = sanitizePathSegment(templateId)
  if (!uid || !tid) return null
  return `forms/${uid}/${tid}${CANONICAL_SUFFIX}`
}

export function canonicalFormSubmissionPdfKey(ownerId, templateId, submissionId) {
  const uid = sanitizePathSegment(ownerId)
  const tid = sanitizePathSegment(templateId)
  const sid = sanitizePathSegment(submissionId)
  if (!uid || !tid || !sid) return null
  return `forms/${uid}/${tid}/submissions/${sid}.pdf`
}

export function isWellFormedFormSubmissionPdfKey(key) {
  const parts = String(key || '').split('/')
  if (parts.length !== 5 || parts[0] !== 'forms' || parts[3] !== 'submissions') return false
  if (!parts[4].endsWith('.pdf')) return false
  return (
    sanitizePathSegment(parts[1]) === parts[1]
    && sanitizePathSegment(parts[2]) === parts[2]
    && sanitizePathSegment(parts[4].replace(/\.pdf$/, '')) + '.pdf' === parts[4]
  )
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
