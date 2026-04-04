/**
 * Deal pipeline - leads and columns stored in localStorage
 */

const COLUMNS_KEY = 'deal_pipeline_columns'
const LEADS_KEY = 'deal_pipeline_leads'
const TITLE_KEY = 'deal_pipeline_title'
const DEFAULT_TITLE = 'Pipes'

const DEFAULT_COLUMNS = [
  'Make Contact',
  'Roof Inspection',
  'File Claim',
  'Service Agreement',
  "Adjuster's Meeting",
  'Scope of Loss',
  'Appraisal',
  'Ready for Install',
  'Install Scheduled',
  'Installed',
]

export const loadColumns = () => {
  try {
    const stored = localStorage.getItem(COLUMNS_KEY)
    if (!stored) return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  } catch {
    return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  }
}

export const saveColumns = (columns) => {
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns))
  } catch (e) {
    console.error('Error saving deal pipeline columns:', e)
  }
}

export const loadLeads = () => {
  try {
    const stored = localStorage.getItem(LEADS_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveLeads = (leads) => {
  try {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  } catch (e) {
    console.error('Error saving deal pipeline leads:', e)
  }
}

export const loadTitle = () => {
  try {
    const stored = localStorage.getItem(TITLE_KEY)
    return stored || DEFAULT_TITLE
  } catch {
    return DEFAULT_TITLE
  }
}

export const saveTitle = (title) => {
  try {
    localStorage.setItem(TITLE_KEY, (title || DEFAULT_TITLE).trim() || DEFAULT_TITLE)
  } catch (e) {
    console.error('Error saving deal pipeline title:', e)
  }
}

/**
 * Build full SITUS (property) address only. Never mixes in mailing address.
 * Uses: SITUS_ADDR, SITE_ADDR, STREET, ADDR_LINE1; city/state/zip from situs fields only.
 * Explicitly excludes: MAIL_ADDR, MAILING_ADDR, MAIL_CITY, MAIL_STATE, MAIL_ZIP.
 * @param {Object} data - { address?, properties? }
 */
export function getFullAddress(data) {
  const p = data?.properties || {}
  // Situs city/state/zip only - never MAIL_CITY, MAIL_STATE, MAIL_ZIP
  const city = p.scity || p.PROP_CITY || p.SITUS_CITY || p.CITY || ''
  const state = p.state2 || p.PROP_STATE || p.SITUS_STATE || p.STATE || ''
  const zip = (p.szip || p.szip5 || p.PROP_ZIP || p.SITUS_ZIP || p.ZIP || p.ZIP_CODE || '').toString().trim()

  if (city || state || zip) {
    // Have separate situs city/state/zip - use street from situs only
    const street = p.STREET || p.ADDR_LINE1 || p.saddstr || ''
    if (street.trim()) {
      const parts = [street.trim(), city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean)
      return parts.join(', ').trim() || 'Unknown'
    }
    // Full situs string - never ADDRESS (could be mailing), never MAIL_*
    const situsFull = data?.address || p.SITUS_ADDR || p.SITE_ADDR || ''
    const streetOnly = situsFull.indexOf(',') > 0 ? situsFull.slice(0, situsFull.indexOf(',')).trim() : situsFull.trim()
    const parts = [streetOnly || situsFull, city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean)
    return parts.join(', ').trim() || 'Unknown'
  }

  // No separate situs city/state/zip - use situs full address only
  const situsFull = data?.address || p.SITUS_ADDR || p.SITE_ADDR || p.STREET || p.ADDR_LINE1 || ''
  return situsFull.trim() || 'Unknown'
}

/**
 * Extract street-only SITUS address. Never uses mailing address fields.
 * @param {Object} data - { address?, properties? }
 */
export function getStreetAddress(data) {
  const p = data?.properties || {}
  const street = p.STREET || p.ADDR_LINE1 || p.saddstr || ''
  if (street.trim()) return street.trim()
  // Situs full only - never ADDRESS (may be mailing), never MAIL_ADDR/MAILING_ADDR
  const situsFull = data?.address || p.SITUS_ADDR || p.SITE_ADDR || ''
  if (!situsFull.trim()) return 'Unknown'
  const firstComma = situsFull.indexOf(',')
  return firstComma > 0 ? situsFull.slice(0, firstComma).trim() : situsFull.trim()
}

/**
 * Add a lead from parcel data. Uses first column as default status.
 * @param {Object} parcelData - { id, address, properties, lat, lng }
 * @param {Array} columns - current columns (from loadColumns)
 * @returns {Object|null} the created lead or null if parcel already a lead
 */
export const addLead = (parcelData, columns) => {
  if (!parcelData?.id) return null
  const leads = loadLeads()
  if (leads.some(l => l.parcelId === parcelData.id)) return null
  const firstColId = columns?.[0]?.id || 'col-0'
  const now = Date.now()
  const lead = {
    id: `lead-${now}-${parcelData.id}`,
    parcelId: parcelData.id,
    address: getStreetAddress(parcelData),
    owner: parcelData.properties?.OWNER_NAME || null,
    lat: parcelData.lat ?? (parcelData.properties?.LATITUDE ? parseFloat(parcelData.properties.LATITUDE) : null),
    lng: parcelData.lng ?? (parcelData.properties?.LONGITUDE ? parseFloat(parcelData.properties.LONGITUDE) : null),
    status: firstColId,
    createdAt: now,
    statusEnteredAt: now,
    cumulativeTimeByStatus: {}, // { [statusId]: ms } - total ms spent in each status across all visits
    properties: parcelData.properties || null,
  }
  const updated = [...leads, lead]
  saveLeads(updated)
  return lead
}

export const isParcelALead = (parcelId) => {
  const leads = loadLeads()
  return leads.some(l => l.parcelId === parcelId)
}

/**
 * Update a lead's fields (e.g. owner/name)
 * @param {string} leadId - Lead ID
 * @param {Object} updates - Fields to merge (e.g. { owner: 'New Name' })
 */
export const updateLead = (leadId, updates) => {
  if (!leadId || !updates) return
  const leads = loadLeads()
  const idx = leads.findIndex(l => l.id === leadId)
  if (idx < 0) return
  leads[idx] = { ...leads[idx], ...updates }
  saveLeads(leads)
  return leads[idx]
}

/**
 * Format a duration in milliseconds to human-readable string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} e.g. "2d 5h", "45m", "< 1m"
 */
export const formatDuration = (ms) => {
  if (ms == null || typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day > 0) return `${day}d ${hr % 24}h`
  if (hr > 0) return `${hr}h ${min % 60}m`
  if (min > 0) return `${min}m`
  return '< 1m'
}

/**
 * Get cumulative time in current state (includes previous stints when lead moved out and back).
 * @param {Object} lead - Lead with status, statusEnteredAt, cumulativeTimeByStatus, createdAt
 * @returns {string} Human-readable cumulative duration in current state
 */
export const formatTimeInState = (lead) => {
  if (!lead) return ''
  const cum = lead.cumulativeTimeByStatus || {}
  const cumMs = typeof cum[lead.status] === 'number' && Number.isFinite(cum[lead.status]) ? cum[lead.status] : 0
  const entered = lead.statusEnteredAt ?? lead.createdAt
  const ts = entered != null && typeof entered === 'number' && Number.isFinite(entered) ? entered : null
  const currentStintMs = ts != null && ts > 0 ? Math.max(0, Date.now() - ts) : 0
  const totalMs = cumMs + currentStintMs
  return formatDuration(totalMs)
}
