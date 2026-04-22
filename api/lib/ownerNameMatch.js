/**
 * Owner name parsing + matching for skip-trace filtering.
 *
 * Parcel OWNER_NAME fields come in many shapes across county GIS sources:
 *   "SMITH JOHN A"           -> LAST FIRST MI
 *   "JOHN A SMITH"           -> FIRST MI LAST
 *   "SMITH, JOHN A"          -> LAST, FIRST MI
 *   "SMITH JOHN & MARY"      -> joint owners
 *   "SMITH JOHN TRUSTEE"     -> suffix / role
 *   "ABC PROPERTIES LLC"     -> business entity (no person to trace)
 *
 * The matcher returns 'high' / 'medium' / 'no-match' so callers can decide
 * how strict to be. Used server-side by /api/skip-trace to filter Trestle's
 * `current_residents[]` down to just the residents plausibly belonging to
 * the parcel owner.
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

// Multi-word business phrases that shouldn't be word-split to detect.
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

// Multi-word suffix phrases that need to be stripped as a unit.
const SUFFIX_PHRASES = [
  'ET AL', 'ET UX', 'ET VIR',
  'LIFE ESTATE', 'LIVING TRUST', 'REVOCABLE TRUST', 'FAMILY TRUST',
  'AS TRUSTEE', 'AS TRUSTEES', 'HUSBAND AND WIFE', 'H AND W'
]

const PUNCT_RE = /["']/g

/** Trim, uppercase, and collapse whitespace. Keeps commas and ampersands. */
function normalize(s) {
  return String(s || '').trim().replace(PUNCT_RE, '').replace(/\s+/g, ' ').toUpperCase()
}

/** Normalize for comparison only: also strip periods and commas. */
function normalizeForCompare(s) {
  return normalize(s).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
}

export function isBusinessName(name) {
  const n = normalize(name)
  if (!n) return false
  for (const phrase of BUSINESS_PHRASES) {
    if (n.includes(phrase)) return true
  }
  const words = n.replace(/[.,]/g, '').split(/\s+/).filter(Boolean)
  return words.some((w) => BUSINESS_MARKERS.has(w))
}

/** "SMITH JOHN & MARY" -> "SMITH JOHN" */
function stripJointOwners(s) {
  // Split on & / AND / + (with at least one surrounding space for AND/+ to avoid
  // killing "AND"-looking surnames) and keep only the first chunk.
  const parts = s.split(/\s*(?:&|\+|\bAND\b)\s+/)
  return parts[0].trim()
}

/** Strip trailing/embedded suffix phrases + words. */
function stripSuffixes(s) {
  let cleaned = s
  for (const phrase of SUFFIX_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'g')
    cleaned = cleaned.replace(re, ' ')
  }
  const words = cleaned.split(/\s+/).filter(Boolean).filter((w) => !SUFFIX_WORDS.has(w.replace(/[.,]/g, '')))
  return words.join(' ').trim()
}

/**
 * Parse a parcel OWNER_NAME into structured name tokens plus a fallback
 * interpretation for alternate word orderings.
 *
 * @param {string} raw - e.g. "SMITH JOHN A" or "John A Smith"
 * @returns {null | {
 *   business: boolean,
 *   raw: string,
 *   first?: string,
 *   middle?: string,
 *   last?: string,
 *   altFirstLast?: { first: string, middle: string, last: string }
 * }}
 */
export function parseOwnerName(raw) {
  const n = normalize(raw)
  if (!n) return null
  if (isBusinessName(n)) return { business: true, raw: n }

  let cleaned = stripJointOwners(n)
  cleaned = stripSuffixes(cleaned)
  cleaned = cleaned.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  // Comma-separated: "SMITH, JOHN A" -> LAST, FIRST MI
  if (raw.includes(',')) {
    const rawParts = raw.split(',')
    const last = normalizeForCompare(rawParts[0])
    const rest = normalizeForCompare(rawParts.slice(1).join(','))
    const restWords = rest.split(/\s+/).filter(Boolean)
    return {
      business: false,
      raw: n,
      last,
      first: restWords[0] || '',
      middle: restWords.slice(1).join(' '),
      altFirstLast: null
    }
  }

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return { business: false, raw: n, last: words[0], first: '', middle: '', altFirstLast: null }
  }

  // Default to LAST FIRST MI (the dominant pattern in US parcel GIS data),
  // but also remember a FIRST MIDDLE LAST interpretation so matching can
  // try both orderings against Trestle's residents.
  const primary = {
    last: words[0],
    first: words[1] || '',
    middle: words.slice(2).join(' ')
  }
  const altFirstLast = {
    first: words[0],
    middle: words.slice(1, -1).join(' '),
    last: words[words.length - 1]
  }
  return {
    business: false,
    raw: n,
    ...primary,
    altFirstLast
  }
}

/**
 * Score a resident against a parsed owner.
 *
 * @param {ReturnType<typeof parseOwnerName>} owner
 * @param {{ name?: string, firstname?: string, lastname?: string, alternate_names?: string[] }} resident
 * @returns {'high' | 'medium' | 'no-match'}
 */
export function matchResident(owner, resident) {
  if (!owner || owner.business) return 'no-match'
  if (!resident) return 'no-match'

  const rFirst = normalizeForCompare(resident.firstname)
  const rLast = normalizeForCompare(resident.lastname)
  const rFull = normalizeForCompare(resident.name)
  const altNames = Array.isArray(resident.alternate_names)
    ? resident.alternate_names.map(normalizeForCompare)
    : []

  const tryOrdering = (owFirst, owLast) => {
    if (!owLast) return 'no-match'

    // Direct field match (best signal).
    if (rLast && owLast === rLast) {
      if (owFirst && rFirst && owFirst === rFirst) return 'high'
      if (owFirst && rFirst && owFirst[0] === rFirst[0]) return 'medium'
      if (!owFirst) return 'medium'
    }

    // Alternate names: look for owner's last + optional first as separate tokens.
    for (const alt of altNames) {
      const tokens = alt.split(/\s+/).filter(Boolean)
      if (tokens.includes(owLast) && (!owFirst || tokens.includes(owFirst))) return 'medium'
    }

    // Full-name string fallback (handles "JOHN A SMITH" full-name match).
    if (rFull) {
      const fullTokens = rFull.split(/\s+/).filter(Boolean)
      if (fullTokens.includes(owLast) && (!owFirst || fullTokens.includes(owFirst))) return 'medium'
    }

    return 'no-match'
  }

  // Try both orderings and keep the stronger result — "JOHN SMITH" should
  // match resident "John A Smith" as 'high' (via FIRST LAST interpretation),
  // not fall back to the weaker 'medium' we'd get from the primary ordering.
  const rank = { high: 3, medium: 2, 'no-match': 0 }
  const results = [tryOrdering(owner.first, owner.last)]
  if (owner.altFirstLast) {
    results.push(tryOrdering(owner.altFirstLast.first, owner.altFirstLast.last))
  }
  return results.reduce((best, r) => (rank[r] > rank[best] ? r : best), 'no-match')
}
