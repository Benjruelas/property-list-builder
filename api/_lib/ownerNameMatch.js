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
 *   "MC MILLIAN THOMAS"      -> split Mc/Mac surname + reversed order
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

/** Particles that GIS often splits from the following surname token. */
const JOIN_PARTICLES = new Set(['MC', 'MAC', 'O', 'ST', 'SAINT'])

const PUNCT_RE = /["']/g

/** Trim, uppercase, and collapse whitespace. Keeps commas and ampersands. */
function normalize(s) {
  return String(s || '').trim().replace(PUNCT_RE, '').replace(/\s+/g, ' ').toUpperCase()
}

/** Normalize for comparison only: also strip periods and commas. */
function normalizeForCompare(s) {
  return normalize(s).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
}

/** Compact form for hyphen/space-insensitive surname compare. */
function compactName(s) {
  return normalizeForCompare(s).replace(/[-\s]/g, '')
}

/**
 * Join split surname particles: "MC MILLIAN" -> "MCMILLIAN",
 * "MAC DONALD" -> "MACDONALD", "O BRIEN" -> "OBRIEN", "ST JOHN" -> "STJOHN".
 */
export function joinNameParticles(words) {
  const list = Array.isArray(words) ? words.filter(Boolean) : []
  const out = []
  for (let i = 0; i < list.length; i++) {
    const w = list[i]
    const next = list[i + 1]
    if (next && JOIN_PARTICLES.has(w) && next.length >= 2 && !JOIN_PARTICLES.has(next)) {
      out.push(w + next)
      i++
      continue
    }
    out.push(w)
  }
  return out
}

function tokenizeName(s) {
  return joinNameParticles(normalizeForCompare(s).split(/\s+/).filter(Boolean))
}

function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/**
 * Compare surnames with conservative fuzzy rules.
 * @returns {'exact' | 'close' | false}
 */
export function compareLastNames(a, b) {
  const left = normalizeForCompare(a)
  const right = normalizeForCompare(b)
  if (!left || !right) return false
  if (left === right) return 'exact'

  const leftC = compactName(left)
  const rightC = compactName(right)
  if (leftC === rightC) return 'exact'

  // Mc/Mac with vs without leading particle on the remainder.
  for (const prefix of ['MC', 'MAC']) {
    if (leftC.startsWith(prefix) && leftC.slice(prefix.length) === rightC) return 'close'
    if (rightC.startsWith(prefix) && rightC.slice(prefix.length) === leftC) return 'close'
  }

  const maxLen = Math.max(leftC.length, rightC.length)
  const dist = levenshtein(leftC, rightC)
  if (maxLen >= 5 && dist <= 1) return 'close'
  if (maxLen >= 8 && dist <= 2) return 'close'
  return false
}

function tokenIncludesLast(tokens, last) {
  return tokens.some((t) => compareLastNames(t, last))
}

function firstMatches(owFirst, rFirst) {
  if (!owFirst || !rFirst) return !owFirst ? 'none' : false
  if (owFirst === rFirst) return 'exact'
  if (owFirst[0] === rFirst[0]) return 'initial'
  return false
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
 *   tokens?: string[],
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

  // Comma-separated: "SMITH, JOHN A" / "MC MILLIAN, THOMAS" -> LAST, FIRST MI
  if (raw.includes(',')) {
    const rawParts = raw.split(',')
    const lastWords = joinNameParticles(normalizeForCompare(rawParts[0]).split(/\s+/).filter(Boolean))
    const restWords = joinNameParticles(normalizeForCompare(rawParts.slice(1).join(',')).split(/\s+/).filter(Boolean))
    return {
      business: false,
      raw: n,
      last: lastWords[0] || '',
      first: restWords[0] || '',
      middle: restWords.slice(1).join(' '),
      tokens: [...lastWords, ...restWords],
      altFirstLast: null
    }
  }

  const words = joinNameParticles(cleaned.split(/\s+/).filter(Boolean))
  if (words.length === 1) {
    return {
      business: false,
      raw: n,
      last: words[0],
      first: '',
      middle: '',
      tokens: words,
      altFirstLast: null
    }
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
    tokens: words,
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
  const rLastRaw = normalizeForCompare(resident.lastname)
  const rLastJoined = joinNameParticles(rLastRaw.split(/\s+/).filter(Boolean)).join('') || rLastRaw
  const rFull = normalizeForCompare(resident.name)
  const altNames = Array.isArray(resident.alternate_names)
    ? resident.alternate_names.map(normalizeForCompare)
    : []

  const tryOrdering = (owFirst, owLast) => {
    if (!owLast) return 'no-match'

    const lastCmp = rLastJoined ? compareLastNames(owLast, rLastJoined) : false
    if (lastCmp) {
      const firstCmp = firstMatches(owFirst, rFirst)
      if (firstCmp === 'exact') return lastCmp === 'exact' ? 'high' : 'medium'
      if (firstCmp === 'initial') return 'medium'
      if (firstCmp === 'none') return 'medium'
    }

    // Alternate names: owner's last (+ optional exact first) as tokens.
    for (const alt of altNames) {
      const tokens = tokenizeName(alt)
      if (tokenIncludesLast(tokens, owLast) && (!owFirst || tokens.includes(owFirst))) return 'medium'
    }

    // Full-name string fallback.
    if (rFull) {
      const fullTokens = tokenizeName(rFull)
      if (tokenIncludesLast(fullTokens, owLast) && (!owFirst || fullTokens.includes(owFirst))) {
        return 'medium'
      }
    }

    return 'no-match'
  }

  const rank = { high: 3, medium: 2, 'no-match': 0 }
  const results = [tryOrdering(owner.first, owner.last)]
  if (owner.altFirstLast) {
    results.push(tryOrdering(owner.altFirstLast.first, owner.altFirstLast.last))
  }

  let best = results.reduce((acc, r) => (rank[r] > rank[acc] ? r : acc), 'no-match')
  if (best !== 'no-match') return best

  // Order-independent token cover: owner tokens cover resident first + last.
  const ownerTokens = Array.isArray(owner.tokens) && owner.tokens.length
    ? owner.tokens
    : [owner.last, owner.first, owner.middle].filter(Boolean).flatMap((p) => String(p).split(/\s+/)).filter(Boolean)

  if (rFirst && rLastJoined && ownerTokens.length >= 2) {
    const hasFirst = ownerTokens.includes(rFirst)
    const hasLast = ownerTokens.some((t) => compareLastNames(t, rLastJoined))
    if (hasFirst && hasLast) return 'medium'
  }

  // Resident full-name tokens vs owner first+last (either ordering).
  if (rFull && owner.last) {
    const fullTokens = tokenizeName(rFull)
    const hasLast = tokenIncludesLast(fullTokens, owner.last)
    const hasFirst = !owner.first || fullTokens.includes(owner.first)
    if (hasLast && hasFirst) return 'medium'
    if (owner.altFirstLast?.last) {
      const altLast = tokenIncludesLast(fullTokens, owner.altFirstLast.last)
      const altFirst = !owner.altFirstLast.first || fullTokens.includes(owner.altFirstLast.first)
      if (altLast && altFirst) return 'medium'
    }
  }

  return 'no-match'
}
