/**
 * Client-side owner-name parsing — turns a parcel OWNER_NAME string
 * ("LASTNAME, FIRSTNAME INITIAL", "SMITH JOHN A", "John A Smith", etc.)
 * into a structured { firstName, lastName } pair suitable for a Lead's
 * first-name / last-name fields.
 *
 * Mirrors the behavior of api/lib/ownerNameMatch.js parseOwnerName but
 * returns title-cased names ready for UI display. Business entities
 * ("ABC PROPERTIES LLC") collapse to lastName = original raw value,
 * firstName = '' so the Lead still carries the original label.
 */

const BUSINESS_MARKERS = new Set([
  'LLC', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY',
  'LP', 'LLP', 'LTD', 'PLC', 'PC', 'PA',
  'TRUST', 'TR', 'TTEE', 'TRUSTEES',
  'PROPERTIES', 'HOLDINGS', 'ENTERPRISES', 'INVESTMENTS', 'PARTNERS',
  'GROUP', 'ASSOCIATES', 'ASSOCIATION',
  'BANK', 'CHURCH', 'FOUNDATION', 'SCHOOL', 'FUND', 'HOSPITAL',
  'AUTHORITY', 'AGENCY', 'DEPT', 'DEPARTMENT',
  'LIMITED', 'SERVICES'
])

const BUSINESS_PHRASES = [
  'ESTATE OF', 'CITY OF', 'COUNTY OF', 'STATE OF', 'TOWN OF',
  'UNITED STATES', 'DOING BUSINESS AS', 'DBA'
]

const SUFFIX_WORDS = new Set([
  'JR', 'SR', 'II', 'III', 'IV', 'V',
  'TRUSTEE', 'TRUSTEES', 'TR', 'TTEE',
  'ETUX', 'ETVIR', 'ETAL',
  'LE', 'HW', 'WH', 'JT', 'TIC',
  'MD', 'DDS', 'PHD', 'ESQ', 'DR', 'REV', 'HON'
])

const SUFFIX_PHRASES = [
  'ET AL', 'ET UX', 'ET VIR',
  'LIFE ESTATE', 'LIVING TRUST', 'REVOCABLE TRUST', 'FAMILY TRUST',
  'AS TRUSTEE', 'AS TRUSTEES', 'HUSBAND AND WIFE', 'H AND W'
]

function normalizeUpper(s) {
  return String(s || '').trim().replace(/["']/g, '').replace(/\s+/g, ' ').toUpperCase()
}

export function isBusinessName(name) {
  const n = normalizeUpper(name)
  if (!n) return false
  for (const phrase of BUSINESS_PHRASES) {
    if (n.includes(phrase)) return true
  }
  const words = n.replace(/[.,]/g, '').split(/\s+/).filter(Boolean)
  return words.some((w) => BUSINESS_MARKERS.has(w))
}

/** "SMITH JOHN & MARY" -> "SMITH JOHN" */
function stripJointOwners(s) {
  const parts = s.split(/\s*(?:&|\+|\bAND\b)\s+/)
  return parts[0].trim()
}

function stripSuffixes(s) {
  let cleaned = s
  for (const phrase of SUFFIX_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'g')
    cleaned = cleaned.replace(re, ' ')
  }
  const words = cleaned.split(/\s+/).filter(Boolean).filter((w) => !SUFFIX_WORDS.has(w.replace(/[.,]/g, '')))
  return words.join(' ').trim()
}

/** Title-case a single word, preserving common-sense punctuation. */
function titleWord(w) {
  if (!w) return ''
  const lower = w.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function titleCase(str) {
  if (!str) return ''
  return String(str).trim().split(/\s+/).map(titleWord).join(' ')
}

/**
 * Parse an owner-name string into { firstName, lastName } using
 * county-data heuristics. Title-cases the result for display.
 *
 * - Comma present: "SMITH, JOHN A" -> { first: 'John', last: 'Smith' }
 * - Two+ words, no comma: assume LAST FIRST MI (dominant in US parcel GIS)
 * - Single word: lastName = that word, firstName = ''
 * - Business entity: firstName = '', lastName = raw (title-cased)
 */
export function splitOwnerName(raw) {
  const original = String(raw || '').trim()
  if (!original) return { firstName: '', lastName: '' }

  if (isBusinessName(original)) {
    // Keep the original label verbatim for business entities — title-casing
    // mangles things like "ABC PROPERTIES LLC" or names the user typed in.
    return { firstName: '', lastName: original }
  }

  const upper = normalizeUpper(original)
  let cleaned = stripJointOwners(upper)
  cleaned = stripSuffixes(cleaned)

  if (original.includes(',')) {
    const parts = cleaned.split(',')
    const lastRaw = (parts[0] || '').trim()
    const restRaw = (parts.slice(1).join(',') || '').trim().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
    const restWords = restRaw.split(/\s+/).filter(Boolean)
    return {
      firstName: titleCase(restWords[0] || ''),
      lastName: titleCase(lastRaw)
    }
  }

  cleaned = cleaned.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return { firstName: '', lastName: '' }
  if (words.length === 1) return { firstName: '', lastName: titleCase(words[0]) }

  // Dominant US parcel pattern: LAST FIRST [MIDDLE|INITIAL]
  return {
    firstName: titleCase(words[1] || ''),
    lastName: titleCase(words[0] || '')
  }
}

/** Compose first + last into a single display string. */
export function composeFullName(firstName, lastName) {
  const f = String(firstName || '').trim()
  const l = String(lastName || '').trim()
  return [f, l].filter(Boolean).join(' ')
}

/**
 * Best-effort display name from a lead: prefer the structured
 * firstName/lastName fields, fall back to the lead.owner string, and
 * finally to the raw parcel OWNER_NAME.
 */
export function displayLeadName(lead, parcelProperties) {
  if (!lead && !parcelProperties) return ''
  const composed = composeFullName(lead?.firstName, lead?.lastName)
  if (composed) return composed
  if (lead?.owner) return lead.owner
  return parcelProperties?.OWNER_NAME || ''
}
