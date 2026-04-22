/**
 * Skip tracing via Trestle IQ — Reverse Address API (/3.1/location).
 *
 * POST body: { parcels: [{ parcelId, address, ownerName? }] }
 * Response:  { success, jobId: 'sync', async: false, status: 'completed',
 *              results: [{ parcelId, phone, phoneNumbers[], email, emails[],
 *                          phoneDetails[], emailDetails[], address, skipTracedAt }] }
 *
 * Trestle Reverse Address is synchronous, so we always return results in the
 * same response (no polling). Each result's phoneDetails/emailDetails carries
 * a per-contact `callerId` set to the resident's full name so the UI can show
 * "5551234567 (Jane Doe)" next to the contact.
 *
 * When the client supplies an `ownerName`, residents are filtered down to
 * those whose name matches the parcel owner so we never ship contacts for
 * unrelated people living at the address. See api/lib/ownerNameMatch.js.
 *
 * Docs: https://docs.trestleiq.com/api-reference/reverse-address-api
 */

import { parseOwnerName, matchResident } from './lib/ownerNameMatch.js'

const TRESTLE_BASE = process.env.TRESTLE_API_BASE || 'https://api.trestleiq.com/3.1'
const TRESTLE_REAL_CONTACT_URL = process.env.TRESTLE_REAL_CONTACT_URL || 'https://api.trestleiq.com/1.1/real_contact'

// Grade ranks for ordering/comparison. Higher wins. Unknown/null is worst so
// an ungraded contact never beats a graded one with the same match tier.
const GRADE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 }
const MATCH_CONF_RANK = { high: 3, medium: 2, unknown: 1 }

/**
 * Parse a free-form US address ("123 Main St, Fort Worth, TX 76107") into
 * structured components Trestle expects.
 */
function parseAddress(addressStr) {
  if (!addressStr || !addressStr.trim()) return null

  const parts = addressStr.split(',').map(p => p.trim()).filter(Boolean)
  let street = parts[0] || addressStr.trim()
  let city = ''
  let state = ''
  let zip = ''

  if (parts.length >= 3) {
    // "STREET, CITY, STATE ZIP" — take everything between the first and last
    // comma as the city (handles "STREET, CITY, SUBURB, STATE ZIP").
    city = parts.slice(1, -1).join(', ')
    const last = parts[parts.length - 1]
    const m = last.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i)
    if (m) {
      state = m[1].toUpperCase()
      zip = m[2] || ''
    } else {
      city = [city, last].filter(Boolean).join(', ')
    }
  } else if (parts.length === 2) {
    // "STREET, CITY" or "STREET, STATE ZIP"
    const tail = parts[1]
    const m = tail.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i)
    if (m) {
      state = m[1].toUpperCase()
      zip = m[2] || ''
    } else {
      city = tail
    }
  }

  // Strip embedded ZIP from city/state if the comma-split didn't isolate it.
  const stateZipInCity = city.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/i)
  if (stateZipInCity && !state) {
    state = stateZipInCity[1].toUpperCase()
    zip = stateZipInCity[2]
    city = city.replace(stateZipInCity[0], '').trim().replace(/,$/, '').trim()
  }

  return {
    street: street || '',
    city: city || '',
    state: state || '',
    zip: zip || ''
  }
}

/**
 * Normalize a raw Trestle phone_number into the shape the UI expects.
 * Strips non-digits/+ from the display value while preserving the value to
 * call.
 */
function normalizePhoneValue(raw) {
  if (!raw) return ''
  // Trestle returns E.164 or local. Keep the "+" if present.
  const str = String(raw).trim()
  if (!str) return ''
  return str
}

/**
 * Convert a single Trestle `current_residents` entry into a flat list of
 * phoneDetails + emailDetails with `callerId` set to that person's name.
 * `matchConfidence` carries the owner-name match signal through to the UI
 * so it can badge contacts (e.g. "verified owner" vs "probable match").
 */
function residentToContacts(resident, matchConfidence = 'unknown') {
  const name = (resident?.name || `${resident?.firstname || ''} ${resident?.lastname || ''}`).trim()
  const phones = Array.isArray(resident?.phones) ? resident.phones : []
  const emails = Array.isArray(resident?.emails) ? resident.emails : []

  const phoneDetails = phones.map(p => {
    const value = normalizePhoneValue(p?.phone_number)
    if (!value) return null
    return {
      value,
      verified: null,
      callerId: name,
      lineType: p?.line_type || null,
      matchConfidence,
      primary: false
    }
  }).filter(Boolean)

  const emailDetails = emails.map(e => {
    const value = typeof e === 'string' ? e.trim() : (e?.email || '').trim()
    if (!value) return null
    return {
      value,
      verified: null,
      callerId: name,
      matchConfidence,
      primary: false
    }
  }).filter(Boolean)

  return { phoneDetails, emailDetails }
}

/**
 * Dedupe contact detail arrays by value (case-insensitive), keeping the first
 * occurrence (which owns the callerId). When two entries have the same value
 * but different matchConfidence, we upgrade to the better of the two so a
 * shared contact keeps the strongest owner-match signal.
 */
function dedupeDetails(details) {
  const rank = { high: 3, medium: 2, unknown: 1, low: 0 }
  const seen = new Map()
  for (const d of details) {
    const key = String(d.value).toLowerCase()
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, d)
      continue
    }
    const existingRank = rank[existing.matchConfidence] ?? 1
    const newRank = rank[d.matchConfidence] ?? 1
    if (newRank > existingRank) {
      seen.set(key, { ...existing, matchConfidence: d.matchConfidence, callerId: d.callerId || existing.callerId })
    }
  }
  return Array.from(seen.values())
}

/**
 * Resolve a parcel request into structured Trestle address fields.
 *
 * Prefers explicit fields the client sends (street/city/state/zip) so parsing
 * is unnecessary when the client already has clean values. Falls back to the
 * legacy `address` string, which we try to parse.
 */
function resolveAddressFields(parcel) {
  const clean = (v) => (typeof v === 'string' ? v.trim() : (v ?? '').toString().trim())
  const street = clean(parcel.street || parcel.streetLine1 || parcel.street_line_1)
  const street2 = clean(parcel.street2 || parcel.streetLine2 || parcel.street_line_2)
  const city = clean(parcel.city)
  const state = clean(parcel.state || parcel.stateCode || parcel.state_code)
  const zip = clean(parcel.zip || parcel.postalCode || parcel.postal_code)

  if (street) {
    return { street, street2, city, state, zip }
  }

  const parsed = parseAddress(parcel.address || '')
  if (!parsed) return { street: '', street2: '', city: '', state: '', zip: '' }
  return {
    street: parsed.street,
    street2: '',
    city: city || parsed.city,
    state: state || parsed.state,
    zip: zip || parsed.zip
  }
}

/**
 * Grade a single (name, phone, email) tuple against Trestle's Real Contact
 * API. Returns null on any network/API failure so callers can degrade
 * gracefully. Both phone and email in the same request are scored in a
 * single billable call — we pair them up per resident to cut API volume.
 *
 * Response shape uses dotted keys: { "phone.contact_grade": "A",
 * "phone.activity_score": 57, "email.contact_grade": "F", ... }
 */
async function callRealContact({ name, phone, email, address, apiKey }) {
  const qs = new URLSearchParams()
  if (name) qs.set('name', name)
  if (phone) qs.set('phone', phone)
  if (email) qs.set('email', email)
  if (address?.street) qs.set('address.street_line_1', address.street)
  if (address?.city) qs.set('address.city', address.city)
  if (address?.state) qs.set('address.state_code', address.state)
  if (address?.zip) qs.set('address.postal_code', address.zip)
  qs.set('address.country_code', 'US')

  const url = `${TRESTLE_REAL_CONTACT_URL}?${qs.toString()}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[skipTrace] Real Contact non-ok:', res.status, data)
      }
      return null
    }
    return data
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[skipTrace] Real Contact request failed:', err.message)
    }
    return null
  }
}

/**
 * Apply Real Contact grades to phoneDetails/emailDetails in place (returns
 * new arrays). Calls are paired (one phone + one email per call) and grouped
 * by callerId so name-matching is scored against the person the contact
 * actually came from.
 */
async function gradeContactLists(phoneDetails, emailDetails, address, apiKey) {
  // Group by resident (callerId) so phone/email from the same person pair
  // into a single Real Contact call.
  const byCaller = new Map()
  const ensure = (k) => {
    if (!byCaller.has(k)) byCaller.set(k, { phones: [], emails: [] })
    return byCaller.get(k)
  }
  for (const p of phoneDetails) ensure(p.callerId || '').phones.push(p)
  for (const e of emailDetails) ensure(e.callerId || '').emails.push(e)

  const gradedPhones = new Map() // value -> merged detail
  const gradedEmails = new Map()

  // Build pairing tasks. When a resident has more phones than emails (or
  // vice versa), extras pair with null on the other side.
  const tasks = []
  for (const [name, { phones, emails }] of byCaller.entries()) {
    const n = Math.max(phones.length, emails.length)
    for (let i = 0; i < n; i++) {
      const phone = phones[i] || null
      const email = emails[i] || null
      tasks.push({ name, phone, email })
    }
  }

  // Fire in parallel — at most one Real Contact call per resident-pair, and
  // the owner filter keeps the count small. If the API fails for a single
  // task, the contact is left ungraded and still returned.
  await Promise.all(tasks.map(async ({ name, phone, email }) => {
    const data = await callRealContact({
      name,
      phone: phone?.value || null,
      email: email?.value || null,
      address,
      apiKey
    })
    if (phone) {
      const grade = data?.['phone.contact_grade'] ?? null
      const activity = typeof data?.['phone.activity_score'] === 'number' ? data['phone.activity_score'] : null
      const lineType = data?.['phone.line_type'] ?? phone.lineType ?? null
      const nameMatch = typeof data?.['phone.name_match'] === 'boolean' ? data['phone.name_match'] : null
      const isValid = typeof data?.['phone.is_valid'] === 'boolean' ? data['phone.is_valid'] : null
      gradedPhones.set(phone.value, { ...phone, grade, activityScore: activity, lineType, nameMatch, isValid })
    }
    if (email) {
      const grade = data?.['email.contact_grade'] ?? null
      const nameMatch = typeof data?.['email.name_match'] === 'boolean' ? data['email.name_match'] : null
      const isValid = typeof data?.['email.is_valid'] === 'boolean' ? data['email.is_valid'] : null
      gradedEmails.set(email.value, { ...email, grade, nameMatch, isValid })
    }
  }))

  return {
    phoneDetails: phoneDetails.map((p) => gradedPhones.get(p.value) || { ...p, grade: null }),
    emailDetails: emailDetails.map((e) => gradedEmails.get(e.value) || { ...e, grade: null })
  }
}

const MAX_CONTACTS_PER_KIND = 5

/**
 * Sort contacts best-to-worst and return the top N. Ordering:
 *   1. contact_grade   (A > B > C > D > F > null)
 *   2. activity_score  (phones only; higher wins)
 *   3. name_match      (true > false > null)
 *   4. matchConfidence (Phase 1 owner match: high > medium > unknown)
 *   5. original index  (stable)
 */
function sortAndTakeContacts(details, kind, limit = MAX_CONTACTS_PER_KIND) {
  if (!Array.isArray(details) || details.length === 0) return []
  const scored = details.map((d, idx) => {
    const gradeRank = GRADE_RANK[d.grade] ?? 0
    const activity = typeof d.activityScore === 'number' ? d.activityScore : -1
    const nameMatch = d.nameMatch === true ? 1 : (d.nameMatch === false ? -1 : 0)
    const matchRank = MATCH_CONF_RANK[d.matchConfidence] ?? 0
    return { d, idx, gradeRank, activity, nameMatch, matchRank }
  })
  scored.sort((a, b) => {
    if (b.gradeRank !== a.gradeRank) return b.gradeRank - a.gradeRank
    if (kind === 'phone' && b.activity !== a.activity) return b.activity - a.activity
    if (b.nameMatch !== a.nameMatch) return b.nameMatch - a.nameMatch
    if (b.matchRank !== a.matchRank) return b.matchRank - a.matchRank
    return a.idx - b.idx
  })
  return scored.slice(0, limit).map((s) => s.d)
}

async function traceOne(parcel, apiKey) {
  const fields = resolveAddressFields(parcel)

  if (!fields.street) {
    return {
      parcelId: parcel.parcelId,
      phone: null,
      phoneNumbers: [],
      email: null,
      emails: [],
      phoneDetails: [],
      emailDetails: [],
      address: null,
      skipTracedAt: new Date().toISOString(),
      warnings: ['Missing address'],
      error: 'Missing street address'
    }
  }

  // Trestle returns "Missing Input" with zero residents when street is sent
  // alone. Require at least one of city / zip alongside the street to avoid a
  // guaranteed-empty call.
  if (!fields.city && !fields.zip) {
    return {
      parcelId: parcel.parcelId,
      phone: null,
      phoneNumbers: [],
      email: null,
      emails: [],
      phoneDetails: [],
      emailDetails: [],
      address: null,
      skipTracedAt: new Date().toISOString(),
      warnings: ['Missing Input'],
      error: 'Skip trace needs a full mailing address (street + city or zip).'
    }
  }

  // Trestle's Reverse Address 3.1 API documents bare parameter names
  // (`street_line_1`, `city`, `state_code`, `postal_code`, `country_code`).
  // The `address.`-prefixed form shown in their cURL examples appears to be
  // silently ignored on the 3.1 endpoint, which is why we were getting
  // "Missing Input" + `is_valid: false` on requests where every field was
  // actually populated correctly.
  const qs = new URLSearchParams()
  qs.set('street_line_1', fields.street)
  if (fields.street2) qs.set('street_line_2', fields.street2)
  if (fields.city) qs.set('city', fields.city)
  if (fields.state) qs.set('state_code', fields.state)
  if (fields.zip) qs.set('postal_code', fields.zip)
  qs.set('country_code', 'US')

  const url = `${TRESTLE_BASE}/location?${qs.toString()}`

  if (process.env.NODE_ENV !== 'production') {
    // Log the exact structured fields we're sending so mis-parsed addresses
    // (state as full name, zip with +4, empty city, etc.) are easy to spot.
    console.log('[skipTrace] Trestle request:', {
      parcelId: parcel.parcelId,
      fields
    })
  }

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    })
  } catch (err) {
    throw new Error(`Trestle request failed: ${err.message}`)
  }

  const bodyText = await response.text()
  let data = null
  try {
    data = bodyText ? JSON.parse(bodyText) : null
  } catch {
    throw new Error(`Trestle returned non-JSON response (status ${response.status})`)
  }

  if (!response.ok) {
    const msg = data?.error?.message || data?.message || bodyText.slice(0, 200) || `HTTP ${response.status}`
    const err = new Error(`Trestle ${response.status}: ${msg}`)
    err.status = response.status
    err.details = data
    throw err
  }

  // Trestle may return `is_valid: false` when the address can't be resolved
  // (e.g. house number doesn't exist). Per the docs, in that case
  // `current_residents` will be empty; surface a clear warning.
  const warnings = Array.isArray(data?.warnings) ? [...data.warnings] : []
  if (data && data.is_valid === false && !warnings.some(w => /invalid/i.test(w))) {
    warnings.push('Invalid Address')
  }

  // A 200 response may still carry a partial `error` object per the docs
  // ({ name: "InternalError", message: "Could not retrieve entire response" }).
  // We keep whatever residents came back but surface the error text.
  const partialError = data?.error?.message
    ? `${data.error.name || 'PartialError'}: ${data.error.message}`
    : null

  if (process.env.NODE_ENV !== 'production') {
    console.log('[skipTrace] Trestle response:', {
      parcelId: parcel.parcelId,
      is_valid: data?.is_valid,
      residents: Array.isArray(data?.current_residents) ? data.current_residents.length : 0,
      warnings: data?.warnings,
      error: data?.error
    })
  }

  const residents = Array.isArray(data?.current_residents) ? data.current_residents : []

  // Filter residents down to those matching the parcel owner:
  //   - No ownerName supplied            -> return every resident ('unknown' match)
  //   - ownerName parses as a business   -> return nothing (nobody to trace)
  //   - ownerName parses as a person     -> only residents with a real match
  const parsedOwner = parseOwnerName(parcel.ownerName)
  const ownerIsPerson = !!(parsedOwner && !parsedOwner.business)
  const ownerIsBusiness = !!parsedOwner?.business

  let matchedResidents
  if (ownerIsBusiness) {
    matchedResidents = []
  } else if (ownerIsPerson) {
    matchedResidents = residents
      .map((r) => ({ resident: r, matchConfidence: matchResident(parsedOwner, r) }))
      .filter((c) => c.matchConfidence !== 'no-match')
  } else {
    matchedResidents = residents.map((r) => ({ resident: r, matchConfidence: 'unknown' }))
  }

  const allPhoneDetails = []
  const allEmailDetails = []
  for (const { resident, matchConfidence } of matchedResidents) {
    const { phoneDetails, emailDetails } = residentToContacts(resident, matchConfidence)
    allPhoneDetails.push(...phoneDetails)
    allEmailDetails.push(...emailDetails)
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[skipTrace] owner-filter:', {
      parcelId: parcel.parcelId,
      ownerName: parcel.ownerName,
      parsedOwner: parsedOwner
        ? (parsedOwner.business
          ? { business: true }
          : { first: parsedOwner.first, last: parsedOwner.last })
        : null,
      residentsFromTrestle: residents.length,
      residentsKept: matchedResidents.length,
      droppedResidents: residents.length - matchedResidents.length
    })
  }

  // If we had residents from Trestle but none matched the owner, surface a
  // clear warning rather than silently returning zero contacts.
  if (ownerIsPerson && residents.length > 0 && matchedResidents.length === 0) {
    warnings.push(`No contacts matching owner "${parsedOwner.raw}" found at this address.`)
  }
  if (ownerIsBusiness) {
    warnings.push('Owner is a business entity — no individual resident contacts to trace.')
  }

  const dedupedPhones = dedupeDetails(allPhoneDetails)
  const dedupedEmails = dedupeDetails(allEmailDetails)

  // Phase 2: grade every owner-matched contact through Trestle's Real Contact
  // API so we can surface the single highest-graded phone + email to the
  // user. When grading fails (network, 4xx/5xx) we fall back to the full
  // owner-filtered list so the user still sees the Phase 1 results.
  let phoneDetails = dedupedPhones
  let emailDetails = dedupedEmails
  const hasAnythingToGrade = dedupedPhones.length > 0 || dedupedEmails.length > 0
  if (hasAnythingToGrade) {
    const addressForGrading = {
      street: fields.street,
      city: fields.city,
      state: fields.state,
      zip: fields.zip
    }
    try {
      const graded = await gradeContactLists(dedupedPhones, dedupedEmails, addressForGrading, apiKey)
      const topPhones = sortAndTakeContacts(graded.phoneDetails, 'phone')
      const topEmails = sortAndTakeContacts(graded.emailDetails, 'email')
      phoneDetails = topPhones.map((p, i) => ({ ...p, primary: i === 0 }))
      emailDetails = topEmails.map((e, i) => ({ ...e, primary: i === 0 }))

      if (process.env.NODE_ENV !== 'production') {
        console.log('[skipTrace] grading summary:', {
          parcelId: parcel.parcelId,
          phonesConsidered: graded.phoneDetails.map((p) => ({ value: p.value, grade: p.grade, activity: p.activityScore, nameMatch: p.nameMatch })),
          emailsConsidered: graded.emailDetails.map((e) => ({ value: e.value, grade: e.grade, nameMatch: e.nameMatch })),
          keptPhones: phoneDetails.map((p) => ({ value: p.value, grade: p.grade })),
          keptEmails: emailDetails.map((e) => ({ value: e.value, grade: e.grade }))
        })
      }

      const droppedPhones = graded.phoneDetails.length - phoneDetails.length
      const droppedEmails = graded.emailDetails.length - emailDetails.length
      if (droppedPhones > 0 || droppedEmails > 0) {
        warnings.push(`Showing top ${MAX_CONTACTS_PER_KIND} phone${MAX_CONTACTS_PER_KIND === 1 ? '' : 's'} / ${MAX_CONTACTS_PER_KIND} email${MAX_CONTACTS_PER_KIND === 1 ? '' : 's'} (dropped ${droppedPhones} phone${droppedPhones === 1 ? '' : 's'} / ${droppedEmails} email${droppedEmails === 1 ? '' : 's'}).`)
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[skipTrace] grading fell back to unfiltered list:', err.message)
      }
      warnings.push('Contact grading unavailable — showing up to the first 5 owner-matched contacts.')
      phoneDetails = dedupedPhones.slice(0, MAX_CONTACTS_PER_KIND).map((p, i) => ({ ...p, primary: i === 0 }))
      emailDetails = dedupedEmails.slice(0, MAX_CONTACTS_PER_KIND).map((e, i) => ({ ...e, primary: i === 0 }))
    }
  }

  const phoneNumbers = phoneDetails.map(p => p.value)
  const emails = emailDetails.map(e => e.value)

  const normalizedAddress = [
    data?.street_line_1,
    data?.city,
    [data?.state_code, data?.postal_code].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ') || null

  // If Trestle gave us a partial error AND no residents, surface it as the
  // main error so the UI shows a proper error toast. If we got residents
  // anyway, keep the error as a warning so the success path isn't blocked.
  const hasAnyContact = phoneDetails.length > 0 || emailDetails.length > 0
  const result = {
    parcelId: parcel.parcelId,
    phone: phoneNumbers[0] || null,
    phoneNumbers,
    email: emails[0] || null,
    emails,
    phoneDetails,
    emailDetails,
    address: normalizedAddress,
    skipTracedAt: new Date().toISOString(),
    warnings
  }
  if (partialError) {
    if (hasAnyContact) {
      result.warnings = [...result.warnings, partialError]
    } else {
      result.error = partialError
    }
  }
  return result
}

/**
 * Run traces for an array of parcels with a small concurrency cap to stay
 * inside Trestle's rate limit and the Vercel function timeout.
 */
async function traceAll(parcels, apiKey, concurrency = 4) {
  const results = new Array(parcels.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < parcels.length) {
      const i = cursor++
      try {
        results[i] = await traceOne(parcels[i], apiKey)
      } catch (err) {
        results[i] = {
          parcelId: parcels[i].parcelId,
          phone: null,
          phoneNumbers: [],
          email: null,
          emails: [],
          phoneDetails: [],
          emailDetails: [],
          address: null,
          skipTracedAt: new Date().toISOString(),
          error: err.message
        }
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, parcels.length) }, worker)
  await Promise.all(workers)
  return results
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { parcels } = req.body || {}
    if (!Array.isArray(parcels) || parcels.length === 0) {
      return res.status(400).json({ error: 'Parcels array is required' })
    }

    const apiKey = process.env.TRESTLE_API_KEY
    if (!apiKey) {
      return res.status(500).json({
        error: 'Skip tracing service not configured',
        message: 'TRESTLE_API_KEY environment variable is missing.'
      })
    }

    const results = await traceAll(parcels, apiKey)

    return res.status(200).json({
      success: true,
      jobId: 'sync',
      async: false,
      status: 'completed',
      message: 'Skip tracing completed',
      results
    })
  } catch (error) {
    console.error('Skip trace (Trestle) error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
