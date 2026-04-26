/**
 * Situs vs mailing — owner-occupied when the mailing address contains the
 * site/situs address.
 *
 * Counties format mailing addresses inconsistently (some prepend an owner name
 * or care-of line, others append "APT 2" or a city/zip the situs field omits,
 * and the two sides frequently disagree on whether the street suffix is
 * abbreviated — "RD" vs "ROAD", "LN" vs "LANE", "CIR" vs "CIRCLE" etc.). To
 * avoid false negatives from suffix mismatches we strip the trailing street
 * suffix from the situs address before normalizing and doing a substring
 * check against the (non-stripped) mailing address.
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
  'run',
  'hollow', 'holw',
  'spring', 'spg',
  'creek', 'crk',
  'center', 'ctr',
  'grove', 'grv',
]

// Build a single regex that matches any suffix at the end of a string,
// optionally followed by directionals (N/S/E/W/NE/...) or unit designators.
const SUFFIX_RE = new RegExp(
  `\\s+(${STREET_SUFFIXES.join('|')})\\b\\.?\\s*$`,
  'i'
)

/**
 * Strip a trailing street suffix (and the whitespace before it) from a street
 * address. Runs in a single pass so "123 Main St N" becomes "123 Main St" —
 * we don't want to over-strip directionals that might disambiguate two
 * different streets with the same base name.
 */
function stripTrailingStreetSuffix(address) {
  if (!address) return ''
  return String(address).trim().replace(SUFFIX_RE, '').trim()
}

function normAddr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
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

  // Strip the trailing street-type word from the situs side so we don't get
  // false negatives when situs says "Main Rd" but mailing says "Main Road",
  // or situs says "Oak Cir" but mailing says "Oak Circle".
  const situsNoSuffix = normAddr(stripTrailingStreetSuffix(rawSitus))
  const mailAddr = normAddr(rawMail)
  if (!situsNoSuffix || !mailAddr) return null

  return mailAddr.includes(situsNoSuffix) ? 'Yes' : 'No'
}

export const __test__ = { stripTrailingStreetSuffix, normAddr, SUFFIX_RE }
