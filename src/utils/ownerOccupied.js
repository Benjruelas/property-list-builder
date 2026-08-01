/**
 * Situs vs mailing — owner-occupied when the mailing address contains the
 * site/situs address (after normalizing street suffixes, directionals, and
 * unit designators).
 *
 * Counties format mailing addresses inconsistently (some prepend an owner name
 * or care-of line, others append "APT 2" or a city/zip the situs field omits,
 * and the two sides frequently disagree on whether the street suffix is
 * abbreviated — "RD" vs "ROAD", "LN" vs "LANE", "CIR" vs "CIRCLE" etc., or
 * whether a directional is "N" vs "NORTH").
 *
 * Returns 'Yes' | 'No' | null (null when either address is missing).
 */

// USPS street-suffix abbreviations + their long-form equivalents. Kept
// deliberately small — common residential suffixes only, no obscure ones.
const STREET_SUFFIXES = [
  'street', 'st',
  'avenue', 'ave', 'av',
  'boulevard', 'blvd', 'bl',
  'road', 'rd',
  'lane', 'ln',
  'drive', 'dr',
  'circle', 'cir', 'crcl',
  'court', 'ct',
  'place', 'pl',
  'parkway', 'pkwy', 'pky',
  'highway', 'hwy', 'hy',
  'way', 'wy',
  'terrace', 'ter', 'terr',
  'trail', 'trl', 'tr',
  'cove', 'cv',
  'loop', 'lp',
  'square', 'sq',
  'alley', 'aly',
  'path',
  'walk',
  'run',
  'row',
  'crossing', 'xing',
  'manor', 'mnr',
  'point', 'pt',
  'pass',
  'bypass', 'byp',
  'plaza', 'plz',
  'ridge', 'rdg',
  'hollow', 'holw',
  'spring', 'spg',
  'creek', 'crk',
  'center', 'ctr',
  'grove', 'grv',
]

const DIRECTIONALS = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  northeast: 'northeast',
  northwest: 'northwest',
  southeast: 'southeast',
  southwest: 'southwest',
}

const UNIT_RE = /\b(?:apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\b\.?\s*[a-z0-9-]*/gi

// Trailing street suffix, optionally followed by a directional or unit designator.
const SUFFIX_RE = new RegExp(
  `\\s+(${STREET_SUFFIXES.join('|')})\\b\\.?` +
    `(?:\\s+(?:n|s|e|w|ne|nw|se|sw|north|south|east|west|northeast|northwest|southeast|southwest))?` +
    `(?:\\s+(?:apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\\.?\\s*[a-z0-9-]*)?` +
    `\\s*$`,
  'i'
)

const SUFFIX_TOKEN_RE = new RegExp(
  `\\b(?:${STREET_SUFFIXES.join('|')})\\b\\.?`,
  'gi'
)

const DIR_TOKEN_RE = /\b(?:n|s|e|w|ne|nw|se|sw|north|south|east|west|northeast|northwest|southeast|southwest)\b/gi

/**
 * Strip a trailing street suffix (and optional trailing directional / unit)
 * from a street address. "123 Main St N" → "123 Main"; "123 Main St Apt 2" →
 * "123 Main".
 */
function stripTrailingStreetSuffix(address) {
  if (!address) return ''
  return String(address).trim().replace(SUFFIX_RE, '').trim()
}

function expandDirectionals(address) {
  return String(address).replace(DIR_TOKEN_RE, (tok) => {
    const key = tok.toLowerCase().replace(/\./g, '')
    return DIRECTIONALS[key] || tok
  })
}

function stripUnits(address) {
  return String(address).replace(UNIT_RE, ' ').replace(/\s+/g, ' ').trim()
}

function stripStreetSuffixTokens(address) {
  return String(address).replace(SUFFIX_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim()
}

function normAddr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Normalize an address for situs-vs-mailing comparison: expand cardinals,
 * drop unit designators and street-type words, then alphanumeric-fold.
 */
function normalizeAddressCore(address) {
  if (!address) return ''
  let s = String(address).trim().toLowerCase()
  s = expandDirectionals(s)
  s = stripUnits(s)
  s = stripStreetSuffixTokens(s)
  return normAddr(s)
}

export function computeOwnerOccupied(properties) {
  if (!properties || typeof properties !== 'object') return null

  // Prefer the homestead-exemption flag when the assessor provides one
  // (Texas, Florida, and most southern states publish this directly). It's a
  // legally-attested "this is my primary residence" claim by the owner, so
  // it's a stronger signal than any address-substring heuristic — it survives
  // PO-box mailing addresses, name suffix mismatches, and revocable-trust
  // ownership all of which break the situs-vs-mailing comparison below.
  const hsRaw = properties.HOMESTEAD_EXEMPTION
  if (hsRaw !== undefined && hsRaw !== null && hsRaw !== '') {
    const norm = String(hsRaw).trim().toLowerCase()
    if (['yes', 'y', 'true', '1'].includes(norm)) return 'Yes'
    if (['no', 'n', 'false', '0'].includes(norm)) return 'No'
  }

  const rawSitus = properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS
  const rawMail = properties.MAIL_ADDR || properties.MAILING_ADDR || properties.PSTLADRESS
  if (!rawSitus || !rawMail) return null

  const situsCore = normalizeAddressCore(rawSitus)
  const mailCore = normalizeAddressCore(rawMail)
  if (!situsCore || !mailCore) return null

  return mailCore.includes(situsCore) ? 'Yes' : 'No'
}

export const __test__ = {
  stripTrailingStreetSuffix,
  normAddr,
  SUFFIX_RE,
  normalizeAddressCore,
  expandDirectionals,
  stripUnits,
}
