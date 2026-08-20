/**
 * Deal pipeline - leads and columns stored in localStorage
 */

import { splitOwnerName } from './ownerName'
import { DEFAULT_DEAL_STATUSES } from './dealStatuses'

const COLUMNS_KEY = 'deal_pipeline_columns'
const DEALS_KEY = 'deal_pipeline_deals'
const LEADS_KEY = 'deal_pipeline_leads' // legacy — cleared on migration
const TITLE_KEY = 'deal_pipeline_title'
const DEFAULT_TITLE = 'Pipes'

export const DEFAULT_PIPELINE_STAGES = DEFAULT_DEAL_STATUSES.map((status) => status.label)

const DEFAULT_COLUMNS = DEFAULT_DEAL_STATUSES.map(({ id, label }) => ({ id, name: label }))

/** Default pipeline columns for new pipes (canonical deal status ids). */
export function createDefaultPipelineColumns() {
  return DEFAULT_COLUMNS.map((column) => ({ ...column }))
}

export const loadColumns = () => {
  try {
    const stored = localStorage.getItem(COLUMNS_KEY)
    if (!stored) return createDefaultPipelineColumns()
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : createDefaultPipelineColumns()
  } catch {
    return createDefaultPipelineColumns()
  }
}

export const saveColumns = (columns) => {
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns))
  } catch (e) {
    console.error('Error saving deal pipeline columns:', e)
  }
}

export const loadDeals = () => {
  try {
    const stored = localStorage.getItem(DEALS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : []
    }
    // Legacy fallback — do not auto-migrate leads to deals
    return []
  } catch {
    return []
  }
}

export const saveDeals = (deals) => {
  try {
    localStorage.setItem(DEALS_KEY, JSON.stringify(deals))
  } catch (e) {
    console.error('Error saving deal pipeline deals:', e)
  }
}

/** @deprecated use loadDeals */
export const loadLeads = () => loadDeals()

/** @deprecated use saveDeals */
export const saveLeads = (deals) => saveDeals(deals)

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

const PLACEHOLDER_ADDRESSES = new Set([
  '', 'unknown', 'no address', 'no street address', 'parcel', 'loading…', 'loading...',
])

function isPlaceholderAddress(value) {
  return PLACEHOLDER_ADDRESSES.has(String(value || '').trim().toLowerCase())
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
  const fromData = isPlaceholderAddress(data?.address) ? '' : (data?.address || '')

  if (city || state || zip) {
    // Have separate situs city/state/zip - use street from situs only
    const street = p.STREET || p.ADDR_LINE1 || p.saddstr || ''
    if (street.trim()) {
      const parts = [street.trim(), city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean)
      return parts.join(', ').trim() || 'Unknown'
    }
    // Full situs string - never ADDRESS (could be mailing), never MAIL_*
    const situsFull = fromData || p.SITUS_ADDR || p.SITE_ADDR || ''
    const streetOnly = situsFull.indexOf(',') > 0 ? situsFull.slice(0, situsFull.indexOf(',')).trim() : situsFull.trim()
    if (!(streetOnly || situsFull.trim())) {
      // Sparse tiles often only have parcelstate=TX — that is not an address.
      if (!city && !zip) return 'Unknown'
      return [city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean).join(', ').trim() || 'Unknown'
    }
    const parts = [streetOnly || situsFull, city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean)
    return parts.join(', ').trim() || 'Unknown'
  }

  // No separate situs city/state/zip - use situs full address only
  const situsFull = fromData || p.SITUS_ADDR || p.SITE_ADDR || p.STREET || p.ADDR_LINE1 || ''
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
 * @deprecated Leads are no longer added directly to pipelines. Use createLead + buildDealFromLead.
 */
export const addLead = () => null

/** @deprecated check user_leads by parcelId instead */
export const isParcelALead = () => false

/**
 * Format a duration in milliseconds to human-readable string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} e.g. "2d 5h", "45m", "< 1m"
 */
const formatDuration = (ms) => {
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
