/**
 * Skip tracing via Trestle IQ (Reverse Address API).
 *
 * The Trestle endpoint is synchronous, so skipTraceParcels() always resolves
 * with `{ jobId: 'sync', async: false, results: [...] }`. pollSkipTraceJobUntilComplete()
 * is kept as a no-op for compatibility with existing async-polling call sites.
 *
 * The API key lives server-side as TRESTLE_API_KEY and is never exposed to the
 * browser — all calls go through /api/skip-trace.
 */

const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return '/api'
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }
  return import.meta.env.VITE_API_URL || 'https://property-list-builder.vercel.app/api'
}

const API_BASE_URL = getApiBaseUrl()

// Full US state name -> 2-letter abbreviation for Trestle.
const STATE_ABBREVIATIONS = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR'
}

const VALID_STATE_CODES = new Set(Object.values(STATE_ABBREVIATIONS))

const normalizeState = (s) => {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length === 2) return t.toUpperCase()
  return STATE_ABBREVIATIONS[t.toLowerCase()] || t.toUpperCase()
}

/** Pick the first 5-digit block from a zip string ("76107-1234" -> "76107"). */
const normalizeZip = (z) => {
  const m = String(z || '').match(/\d{5}/)
  return m ? m[0] : ''
}

/**
 * Parse a free-form US address ("100 Main St, Fort Worth, TX 76107") into
 * { street, city, state, zip }. Mirrors the server-side parser so we can
 * split full-string property values into structured fields.
 */
const parseFullAddress = (addressStr) => {
  if (!addressStr || !String(addressStr).trim()) return null
  const parts = String(addressStr).split(',').map((p) => p.trim()).filter(Boolean)
  let street = parts[0] || String(addressStr).trim()
  let city = ''
  let state = ''
  let zip = ''

  if (parts.length >= 3) {
    city = parts.slice(1, -1).join(', ')
    const last = parts[parts.length - 1]
    const m = last.match(/^([A-Za-z]{2,})\s*(\d{5}(?:-\d{4})?)?$/)
    if (m) {
      state = m[1]
      zip = m[2] || ''
    } else {
      city = [city, last].filter(Boolean).join(', ')
    }
  } else if (parts.length === 2) {
    const tail = parts[1]
    const m = tail.match(/^([A-Za-z]{2,})\s*(\d{5}(?:-\d{4})?)?$/)
    if (m) {
      state = m[1]
      zip = m[2] || ''
    } else {
      city = tail
    }
  }

  const stateZipInCity = city.match(/\b([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/)
  if (stateZipInCity && !state) {
    state = stateZipInCity[1]
    zip = stateZipInCity[2]
    city = city.replace(stateZipInCity[0], '').trim().replace(/,$/, '').trim()
  }

  return {
    street: street || '',
    city: city || '',
    state: normalizeState(state),
    zip: normalizeZip(zip)
  }
}

/**
 * Build a skip-trace request payload from a parcelData-shaped object.
 * Returns the structured address fields Trestle's Reverse Address API expects
 * plus a composed `address` string for legacy fallback.
 *
 * When the parcel has no mailing address fields, we fall back to a
 * previously-stored Trestle-normalized address (passed via previousFullAddress)
 * so re-skip-tracing a lead that only stored a street works.
 *
 * @param {Object} parcelData - { id, properties, address, ... }
 * @param {Object} [opts]
 * @param {string} [opts.previousFullAddress] - stored Trestle-normalized address to use as fallback
 * @returns {{
 *   payload: { parcelId, address, ownerName, street, city, state, zip } | null,
 *   error: string | null
 * }}
 */
export const buildSkipTraceRequest = (parcelData, opts = {}) => {
  if (!parcelData) return { payload: null, error: 'No parcel selected' }
  const { previousFullAddress = '' } = opts
  const parcelId = parcelData.id
  const p = parcelData.properties || {}

  const pickField = (...keys) => {
    for (const k of keys) {
      const v = p?.[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
    }
    return ''
  }

  // Try the mailing-address fields first (these are what Trestle cares about).
  let street = pickField('MAIL_ADDR', 'MAILING_ADDR', 'MAIL_STREET', 'MAILING_STREET', 'MAILADDR', 'MAILADDR1')
  let city = pickField('MAIL_CITY', 'MAILING_CITY', 'MAILCITY')
  let state = pickField('MAIL_STATE', 'MAILING_STATE', 'MAIL_ST', 'MAILING_ST', 'MAILSTATE')
  let zip = pickField('MAIL_ZIP', 'MAILING_ZIP', 'MAIL_ZIPCODE', 'MAILING_ZIPCODE', 'MAIL_POSTAL', 'MAILZIP')

  // Fall through to situs / property fields with all the variants we've seen
  // in parcel GIS sources (scity, szip, state2, PROP_*, saddstr, etc).
  if (!street) street = pickField('STREET', 'ADDR_LINE1', 'saddstr', 'SITUS_ADDR', 'SITE_ADDR', 'PROP_ADDR', 'ADDRESS')
  if (!city) city = pickField('scity', 'PROP_CITY', 'SITUS_CITY', 'SITE_CITY', 'CITY')
  if (!state) state = pickField('state2', 'PROP_STATE', 'SITUS_STATE', 'SITE_STATE', 'STATE')
  if (!zip) zip = pickField('szip', 'szip5', 'PROP_ZIP', 'SITUS_ZIP', 'SITE_ZIP', 'ZIP', 'ZIPCODE', 'ZIP_CODE', 'POSTAL_CODE')

  // If the street field is actually a full address string ("100 Main St, City,
  // TX 76107"), split it so we can send clean structured fields.
  if (street.includes(',')) {
    const parsed = parseFullAddress(street)
    if (parsed) {
      if (parsed.street) street = parsed.street
      if (!city && parsed.city) city = parsed.city
      if (!state && parsed.state) state = parsed.state
      if (!zip && parsed.zip) zip = parsed.zip
    }
  }

  // Some sources stuff the whole address into MAIL_ADDR with no commas
  // ("912 LINDEN DR BURLESON TX 76028"). If the street ends with the city /
  // state / zip we already have as separate fields, strip them so
  // street_line_1 sent to Trestle is just the street.
  if (street) {
    let cleaned = street.trim().replace(/\s+/g, ' ')

    // Trailing zip (with optional +4).
    const zipMatch = cleaned.match(/\s+(\d{5})(?:-\d{4})?\s*$/)
    if (zipMatch) cleaned = cleaned.slice(0, zipMatch.index).trim()

    // Trailing 2-letter state. Only strip if the suffix matches an actual US
    // state code (avoids chopping street types like "DR", "ST", "AV", "LN").
    const stateMatch = cleaned.match(/\s+([A-Za-z]{2})\s*$/)
    if (stateMatch) {
      const candidate = stateMatch[1].toUpperCase()
      const isRealState = VALID_STATE_CODES.has(candidate)
      if (isRealState && (!state || candidate === state)) {
        cleaned = cleaned.slice(0, stateMatch.index).trim()
      }
    }

    // Trailing city (we have it separately). Build a regex that matches
    // the city words at the end of the string regardless of case.
    if (city) {
      const escapedCity = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const cityRegex = new RegExp(`\\s+${escapedCity}\\s*$`, 'i')
      if (cityRegex.test(cleaned)) {
        cleaned = cleaned.replace(cityRegex, '').trim()
      }
    }

    if (cleaned) street = cleaned
  }

  // If we still lack city/state/zip but have a usable full-address string
  // somewhere (top-level `address`, previous Trestle result), parse that.
  if ((!city || !state || !zip)) {
    const candidates = [parcelData.address, previousFullAddress].filter((s) => s && s.includes(','))
    for (const cand of candidates) {
      const parsed = parseFullAddress(cand)
      if (!parsed) continue
      if (!street) street = parsed.street
      if (!city && parsed.city) city = parsed.city
      if (!state && parsed.state) state = parsed.state
      if (!zip && parsed.zip) zip = parsed.zip
      if (city && state && zip) break
    }
  }

  // Normalize state + zip to what Trestle expects.
  state = normalizeState(state)
  zip = normalizeZip(zip)

  // Final composed fallback string (used by the server only when structured
  // street is empty — which shouldn't happen now).
  const tail = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const addressString = street && tail ? `${street}, ${tail}` : (street || previousFullAddress || parcelData.address || '')

  const hasEnoughStructured = !!(street && city && state)
  if (!hasEnoughStructured) {
    const missing = []
    if (!street) missing.push('street')
    if (!city) missing.push('city')
    if (!state) missing.push('state')
    return {
      payload: null,
      error: `Need a full mailing address to skip trace (missing ${missing.join(', ')}).`
    }
  }

  const ownerName = p?.OWNER_NAME || ''
  const payload = {
    parcelId,
    address: addressString,
    ownerName,
    street,
    city,
    state,
    zip,
  }

  if (import.meta.env?.DEV) {
    // Log what we're actually sending so it's easy to spot mis-parsed
    // addresses (state as full name, zip with extension, missing city, etc.)
    // eslint-disable-next-line no-console
    console.debug('[skipTrace] request payload:', { parcelId, street, city, state, zip, address: addressString })
  }

  return { payload, error: null }
}

/**
 * Skip trace one or more parcels.
 * @param {Array<{parcelId: string, address: string, ownerName?: string}>} parcels
 * @returns {Promise<{ success: boolean, jobId: 'sync', async: false, status: 'completed', results: Array }>}
 */
export const skipTraceParcels = async (parcels) => {
  try {
    const response = await fetch(`${API_BASE_URL}/skip-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcels })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Skip trace error:', error)
    throw error
  }
}

/**
 * Compatibility shim — Trestle is synchronous so jobs never need polling.
 * The existing App.jsx bulk flow handles sync results directly; this exists
 * so leftover async-polling call sites don't crash.
 */
export const pollSkipTraceJob = async () => ({ status: 'completed', results: [] })
export const pollSkipTraceJobUntilComplete = async () => []

/**
 * Get skip traced parcel data from storage (migrates old format to phoneDetails/emailDetails)
 */
export const getSkipTracedParcel = (parcelId) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    if (!stored) return null

    const skipTracedParcels = JSON.parse(stored)
    const data = skipTracedParcels[parcelId]
    if (!data) return null

    if (!data.phoneDetails && (data.phoneNumbers?.length || data.phone)) {
      data.phoneDetails = toPhoneDetails(data.phoneNumbers || (data.phone ? [data.phone] : []), null)
    }
    if (!data.emailDetails && (data.emails?.length || data.email)) {
      data.emailDetails = toEmailDetails(data.emails || (data.email ? [data.email] : []), null)
    }
    return data
  } catch (error) {
    console.error('Error getting skip traced parcel:', error)
    return null
  }
}

/** Normalize contact info into details arrays with verified/callerId/primary/matchConfidence/grade. */
const toPhoneDetails = (phones, existing) => {
  const byValue = new Map((existing || []).map(p => [p.value, p]))
  const arr = Array.isArray(phones) ? phones : (phones ? [phones] : [])
  const hasPrimary = (existing || []).some(d => d.primary)
  return arr.map((value, i) => {
    const prev = byValue.get(value) || {}
    return {
      value,
      verified: prev.verified ?? null,
      callerId: prev.callerId ?? '',
      matchConfidence: prev.matchConfidence ?? null,
      grade: prev.grade ?? null,
      activityScore: prev.activityScore ?? null,
      lineType: prev.lineType ?? null,
      nameMatch: prev.nameMatch ?? null,
      isValid: prev.isValid ?? null,
      primary: prev.primary ?? (!hasPrimary && i === 0)
    }
  })
}
const toEmailDetails = (emails, existing) => {
  const byValue = new Map((existing || []).map(e => [e.value, e]))
  const arr = Array.isArray(emails) ? emails : (emails ? [emails] : [])
  const hasPrimary = (existing || []).some(d => d.primary)
  return arr.map((value, i) => {
    const prev = byValue.get(value) || {}
    return {
      value,
      verified: prev.verified ?? null,
      callerId: prev.callerId ?? '',
      matchConfidence: prev.matchConfidence ?? null,
      grade: prev.grade ?? null,
      nameMatch: prev.nameMatch ?? null,
      isValid: prev.isValid ?? null,
      primary: prev.primary ?? (!hasPrimary && i === 0)
    }
  })
}

const normalizePhoneKey = (v) => String(v || '').replace(/\D/g, '')
const normalizeEmailKey = (v) => String(v || '').trim().toLowerCase()

/** Pick the stronger of two owner-match signals ('high' > 'medium' > 'unknown' > null). */
const MATCH_CONF_RANK = { high: 3, medium: 2, unknown: 1, null: 0, undefined: 0 }
const pickBestMatchConfidence = (a, b) => {
  const ra = MATCH_CONF_RANK[a] ?? 0
  const rb = MATCH_CONF_RANK[b] ?? 0
  return rb > ra ? b : a
}

/** Prefer the freshest grade/metadata from an incoming Real Contact result,
 *  falling back to the existing value when incoming is null/undefined. */
const pickFreshMeta = (existingVal, incomingVal) =>
  incomingVal === undefined || incomingVal === null ? existingVal ?? null : incomingVal

/**
 * Merge fresh skip-trace details into existing details without discarding
 * user-added or user-edited data.
 *
 * Rules:
 * - Contacts that exist in both are kept with their existing verified/primary
 *   flags (user-controlled); callerId is refreshed from the incoming result
 *   when provided (fresh Trestle data).
 * - Contacts that only exist in the stored record are preserved untouched
 *   (covers manually-added numbers/emails and stale skip-trace results).
 * - Contacts that are new in the incoming result are appended with their
 *   incoming callerId.
 * - If no entry has primary=true afterwards, the first item becomes primary.
 */
const mergeDetailsByValue = (existingDetails, incomingDetails, normalize) => {
  const existing = Array.isArray(existingDetails) ? existingDetails : []
  const incoming = Array.isArray(incomingDetails) ? incomingDetails : []
  const incomingByKey = new Map()
  for (const d of incoming) {
    const key = normalize(d.value)
    if (!key) continue
    if (!incomingByKey.has(key)) incomingByKey.set(key, d)
  }
  const merged = []
  const usedKeys = new Set()

  for (const d of existing) {
    const key = normalize(d.value)
    if (!key || usedKeys.has(key)) continue
    usedKeys.add(key)
    const fresh = incomingByKey.get(key)
    if (fresh) {
      merged.push({
        value: d.value,
        verified: d.verified ?? null,
        callerId: (fresh.callerId && fresh.callerId.trim()) ? fresh.callerId : (d.callerId || ''),
        matchConfidence: pickBestMatchConfidence(d.matchConfidence, fresh.matchConfidence),
        grade: pickFreshMeta(d.grade, fresh.grade),
        activityScore: pickFreshMeta(d.activityScore, fresh.activityScore),
        lineType: pickFreshMeta(d.lineType, fresh.lineType),
        nameMatch: pickFreshMeta(d.nameMatch, fresh.nameMatch),
        isValid: pickFreshMeta(d.isValid, fresh.isValid),
        primary: d.primary ?? false
      })
    } else {
      merged.push({
        value: d.value,
        verified: d.verified ?? null,
        callerId: d.callerId || '',
        matchConfidence: d.matchConfidence ?? null,
        grade: d.grade ?? null,
        activityScore: d.activityScore ?? null,
        lineType: d.lineType ?? null,
        nameMatch: d.nameMatch ?? null,
        isValid: d.isValid ?? null,
        primary: d.primary ?? false
      })
    }
  }

  for (const d of incoming) {
    const key = normalize(d.value)
    if (!key || usedKeys.has(key)) continue
    usedKeys.add(key)
    merged.push({
      value: String(d.value || '').trim(),
      verified: d.verified ?? null,
      callerId: d.callerId || '',
      matchConfidence: d.matchConfidence ?? null,
      grade: d.grade ?? null,
      activityScore: d.activityScore ?? null,
      lineType: d.lineType ?? null,
      nameMatch: d.nameMatch ?? null,
      isValid: d.isValid ?? null,
      primary: d.primary ?? false
    })
  }

  if (merged.length > 0 && !merged.some(d => d.primary)) {
    merged[0] = { ...merged[0], primary: true }
  }
  return merged
}

/**
 * Save skip traced parcel data to storage (global list).
 * Accepts phoneDetails/emailDetails with callerId from Trestle; preserves
 * any existing verified/callerId/primary flags when overwriting.
 *
 * When `options.merge` is true, the incoming phoneDetails/emailDetails are
 * merged into any existing record instead of replacing it. Used for
 * re-running skip-trace on a parcel while preserving user-added contacts
 * and user-edited flags (primary / verified).
 */
export const saveSkipTracedParcel = (parcelId, contactInfo, options = {}) => {
  const { merge = false } = options
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}
    const existing = skipTracedParcels[parcelId]

    let phoneDetails
    let emailDetails
    if (merge && existing) {
      const incomingPhones = contactInfo.phoneDetails
        ?? toPhoneDetails(contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []), null)
      const incomingEmails = contactInfo.emailDetails
        ?? toEmailDetails(contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []), null)
      const existingPhones = existing.phoneDetails || toPhoneDetails(existing.phoneNumbers || (existing.phone ? [existing.phone] : []), null)
      const existingEmails = existing.emailDetails || toEmailDetails(existing.emails || (existing.email ? [existing.email] : []), null)
      phoneDetails = mergeDetailsByValue(existingPhones, incomingPhones, normalizePhoneKey)
      emailDetails = mergeDetailsByValue(existingEmails, incomingEmails, normalizeEmailKey)
    } else {
      phoneDetails = contactInfo.phoneDetails ?? existing?.phoneDetails ?? toPhoneDetails(contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []), null)
      emailDetails = contactInfo.emailDetails ?? existing?.emailDetails ?? toEmailDetails(contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []), null)
    }
    const phoneNumbers = phoneDetails.map(p => p.value)
    const emails = emailDetails.map(e => e.value)
    const primaryPhone = phoneDetails.find(p => p.primary) || phoneDetails[0]
    const primaryEmail = emailDetails.find(e => e.primary) || emailDetails[0]

    const preservedSkipTracedAt = 'skipTracedAt' in contactInfo
      ? contactInfo.skipTracedAt
      : (existing?.skipTracedAt || new Date().toISOString())

    skipTracedParcels[parcelId] = {
      phone: primaryPhone?.value || phoneNumbers[0] || null,
      email: primaryEmail?.value || emails[0] || null,
      phoneNumbers,
      emails,
      phoneDetails,
      emailDetails,
      address: contactInfo.address ?? existing?.address ?? null,
      skipTracedAt: preservedSkipTracedAt
    }

    localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
  } catch (error) {
    console.error('Error saving skip traced parcel:', error)
  }
}

/**
 * Replace full phone or email details (for add/remove). Preserves verified/callerId from existing.
 * If no skip-trace record exists yet, seeds one with skipTracedAt: null so the UI can still
 * distinguish "only manual contacts" from "was actually skip-traced".
 */
export const updateSkipTracedContacts = (parcelId, type, newDetails) => {
  if (!parcelId) return
  const data = getSkipTracedParcel(parcelId) || {
    phone: null,
    email: null,
    phoneNumbers: [],
    emails: [],
    phoneDetails: [],
    emailDetails: [],
    address: null,
    skipTracedAt: null
  }

  const existing = type === 'phone' ? (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)) : (data.emailDetails || toEmailDetails(data.emails || [], null))
  const byValue = new Map(existing.map(d => [String(d.value).trim().toLowerCase(), d]))

  const merged = (newDetails || []).map((d, i) => {
    const val = typeof d === 'string' ? d : (d.value ?? d)
    const key = String(val).trim().toLowerCase()
    const prev = byValue.get(key) || {}
    const base = typeof d === 'object' && d !== null ? d : { value: val }
    return {
      value: String(val).trim(),
      verified: base.verified ?? prev.verified ?? null,
      callerId: base.callerId ?? prev.callerId ?? '',
      matchConfidence: base.matchConfidence ?? prev.matchConfidence ?? null,
      grade: base.grade ?? prev.grade ?? null,
      activityScore: base.activityScore ?? prev.activityScore ?? null,
      lineType: base.lineType ?? prev.lineType ?? null,
      nameMatch: base.nameMatch ?? prev.nameMatch ?? null,
      isValid: base.isValid ?? prev.isValid ?? null,
      primary: base.primary ?? prev.primary ?? (i === 0)
    }
  })
  const hasPrimary = merged.some(d => d.primary)
  if (merged.length && !hasPrimary) merged[0] = { ...merged[0], primary: true }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? merged : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? merged : (data.emailDetails || toEmailDetails(data.emails || [], null)),
    skipTracedAt: data.skipTracedAt ?? null
  })
}

/**
 * Update contact metadata (verified, callerId, primary) for a single phone or email.
 */
export const updateContactMeta = (parcelId, type, value, meta) => {
  const data = getSkipTracedParcel(parcelId)
  if (!data) return

  const details = type === 'phone' ? (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)) : (data.emailDetails || toEmailDetails(data.emails || [], null))
  const idx = details.findIndex(d => String(d.value).trim() === String(value).trim())
  if (idx < 0) return

  const updated = details.map(d => ({ ...d, primary: d.primary ?? false }))
  if (meta.verified !== undefined) updated[idx] = { ...updated[idx], verified: meta.verified }
  if (meta.callerId !== undefined) updated[idx] = { ...updated[idx], callerId: meta.callerId }
  if (meta.primary === true) {
    updated.forEach((u, i) => { updated[i] = { ...u, primary: i === idx } })
  } else if (meta.primary === false) {
    updated[idx] = { ...updated[idx], primary: false }
  }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? updated : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? updated : (data.emailDetails || toEmailDetails(data.emails || [], null))
  })
}

/**
 * Save multiple skip traced parcels at once. Preserves phoneDetails/emailDetails
 * (including callerId) when the caller supplies them.
 */
export const saveSkipTracedParcels = (results) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}

    results.forEach(result => {
      if (result.parcelId) {
        const existing = skipTracedParcels[result.parcelId]
        const phoneNumbers = result.phoneNumbers || (result.phone ? [result.phone] : [])
        const emails = result.emails || (result.email ? [result.email] : [])
        skipTracedParcels[result.parcelId] = {
          phone: result.phone || phoneNumbers[0] || null,
          email: result.email || emails[0] || null,
          phoneNumbers,
          emails,
          phoneDetails: result.phoneDetails || toPhoneDetails(phoneNumbers, existing?.phoneDetails),
          emailDetails: result.emailDetails || toEmailDetails(emails, existing?.emailDetails),
          address: result.address || null,
          skipTracedAt: result.skipTracedAt || new Date().toISOString()
        }
      }
    })

    localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
  } catch (error) {
    console.error('Error saving skip traced parcels:', error)
  }
}

export const isParcelSkipTraced = (parcelId) => {
  return getSkipTracedParcel(parcelId) !== null
}

/** Remove a single parcel's skip-trace record from localStorage. */
export const deleteSkipTracedParcel = (parcelId) => {
  if (!parcelId) return
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    if (!stored) return
    const skipTracedParcels = JSON.parse(stored)
    if (skipTracedParcels[parcelId] != null) {
      delete skipTracedParcels[parcelId]
      localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
    }
  } catch (error) {
    console.error('Error deleting skip traced parcel:', error)
  }
}

export const getAllSkipTracedParcels = () => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Error getting all skip traced parcels:', error)
    return {}
  }
}
