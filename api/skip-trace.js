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
 * Docs: https://docs.trestleiq.com/api-reference/reverse-address-api
 */

const TRESTLE_BASE = process.env.TRESTLE_API_BASE || 'https://api.trestleiq.com/3.1'

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
 */
function residentToContacts(resident) {
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
      primary: false
    }
  }).filter(Boolean)

  return { phoneDetails, emailDetails }
}

/**
 * Dedupe contact detail arrays by value (case-insensitive), keeping the first
 * occurrence (which owns the callerId).
 */
function dedupeDetails(details) {
  const seen = new Set()
  const out = []
  for (const d of details) {
    const key = String(d.value).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

async function traceOne(parcel, apiKey) {
  const parsed = parseAddress(parcel.address || '')
  if (!parsed || !parsed.street) {
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
      warnings: ['Missing or unparseable address']
    }
  }

  const qs = new URLSearchParams()
  qs.set('address.street_line_1', parsed.street)
  if (parsed.city) qs.set('address.city', parsed.city)
  if (parsed.state) qs.set('address.state_code', parsed.state)
  if (parsed.zip) qs.set('address.postal_code', parsed.zip)
  qs.set('address.country_code', 'US')

  const url = `${TRESTLE_BASE}/location?${qs.toString()}`

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

  const residents = Array.isArray(data?.current_residents) ? data.current_residents : []
  const allPhoneDetails = []
  const allEmailDetails = []
  for (const r of residents) {
    const { phoneDetails, emailDetails } = residentToContacts(r)
    allPhoneDetails.push(...phoneDetails)
    allEmailDetails.push(...emailDetails)
  }

  const phoneDetails = dedupeDetails(allPhoneDetails)
  const emailDetails = dedupeDetails(allEmailDetails)
  if (phoneDetails.length > 0) phoneDetails[0] = { ...phoneDetails[0], primary: true }
  if (emailDetails.length > 0) emailDetails[0] = { ...emailDetails[0], primary: true }

  const phoneNumbers = phoneDetails.map(p => p.value)
  const emails = emailDetails.map(e => e.value)

  const normalizedAddress = [
    data?.street_line_1,
    data?.city,
    [data?.state_code, data?.postal_code].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ') || null

  return {
    parcelId: parcel.parcelId,
    phone: phoneNumbers[0] || null,
    phoneNumbers,
    email: emails[0] || null,
    emails,
    phoneDetails,
    emailDetails,
    address: normalizedAddress,
    skipTracedAt: new Date().toISOString(),
    warnings: Array.isArray(data?.warnings) ? data.warnings : []
  }
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
