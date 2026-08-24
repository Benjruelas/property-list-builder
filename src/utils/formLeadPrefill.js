/**
 * Map form template fields (via leadKey) onto lead attribute values for autofill.
 */

import { getLeadEmails, getLeadPhones } from './leadContact'
import { getCustomFieldValue, normalizeCustomFieldDefs } from './customFields'
import { CUSTOM_FIELD_TAG_PREFIX } from './leadSendTags'
import { displayLeadName, formatLeadAddress } from './leads'
import { getLeadAddressDetails } from './leadAddresses'
import { getStreetAddress } from './dealPipeline'

export const FORM_LEAD_ATTR_KEYS = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Full address' },
  { key: 'street', label: 'Street' },
  { key: 'cityStateZip', label: 'City, State ZIP' },
  { key: 'notes', label: 'Notes' },
]

const BUILTIN_KEYS = new Set(FORM_LEAD_ATTR_KEYS.map((a) => a.key))

const CITY_KEYS = [
  'scity', 'PROP_CITY', 'SITUS_CITY', 'SITE_CITY', 'CITY', 'CITY_NAME',
  'PLACE_NAME', 'placename', 'parcelcity', 'PARCELCITY',
]
const STATE_KEYS = [
  'state2', 'PROP_STATE', 'SITUS_STATE', 'SITE_STATE', 'STATE',
  'parcelstate', 'PARCELSTATE',
]
const ZIP_KEYS = [
  'szip', 'szip5', 'PROP_ZIP', 'SITUS_ZIP', 'SITE_ZIP', 'ZIP', 'ZIP_CODE',
  'ZIPCODE', 'POSTAL_CODE', 'CENSUS_ZCTA', 'parcelzip', 'PARCELZIP',
]

/** Options for the form-builder lead-field select (built-ins + custom fields). */
export function formLeadKeyOptions(customFieldDefs = []) {
  const custom = normalizeCustomFieldDefs(customFieldDefs).map((def) => ({
    key: `${CUSTOM_FIELD_TAG_PREFIX}${def.id}`,
    label: def.label,
  }))
  return [{ key: '', label: 'None' }, ...FORM_LEAD_ATTR_KEYS, ...custom]
}

export function normalizeFormLeadKey(raw) {
  const key = String(raw || '').trim()
  if (!key) return ''
  if (BUILTIN_KEYS.has(key)) return key
  if (key.startsWith(CUSTOM_FIELD_TAG_PREFIX) && key.length > CUSTOM_FIELD_TAG_PREFIX.length) {
    return key.slice(0, 80)
  }
  return ''
}

function primaryAddressContext(lead) {
  if (!lead) return { address: '', properties: null }
  const details = getLeadAddressDetails(lead)
  const primary = details.find((d) => d.primary) || details[0] || null
  if (primary) {
    const primaryProps = primary.properties
    const hasPrimaryProps = primaryProps && typeof primaryProps === 'object'
      && Object.keys(primaryProps).length > 0
    return {
      address: primary.value || lead.address || '',
      properties: hasPrimaryProps ? primaryProps : (lead.properties || primaryProps || null),
    }
  }
  return {
    address: lead.address || '',
    properties: lead.properties || null,
  }
}

function pickProp(p, keys) {
  if (!p || typeof p !== 'object') return ''
  for (const key of keys) {
    const v = p[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

function formatCityStateZip(city, state, zip) {
  const stateZip = [state, zip].filter(Boolean).join(' ').trim()
  return [city, stateZip].filter(Boolean).join(', ').trim()
}

/** Parse "City, ST 12345" (or subsets) from a full address string. */
function parseCityStateZipFromAddress(full) {
  const text = String(full || '').trim()
  if (!text) return { city: '', state: '', zip: '' }

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 3) {
    // street, city, ST ZIP…
    const city = parts[1]
    const tail = parts.slice(2).join(', ')
    const m = tail.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/)
      || tail.match(/^([A-Za-z]{2})\b/)
    if (m) {
      return {
        city,
        state: (m[1] || '').toUpperCase(),
        zip: m[2] || '',
      }
    }
    const zipOnly = tail.match(/(\d{5}(?:-\d{4})?)/)
    return { city, state: '', zip: zipOnly?.[1] || '' }
  }

  if (parts.length === 2) {
    const tail = parts[1]
    const m = tail.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)
    if (m) {
      return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] }
    }
    const stateZip = tail.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)
    if (stateZip) {
      return { city: '', state: stateZip[1].toUpperCase(), zip: stateZip[2] }
    }
    // "City ST" without zip — treat second segment as city if not a state code alone
    if (/^[A-Za-z]{2}$/.test(tail)) {
      return { city: '', state: tail.toUpperCase(), zip: '' }
    }
    return { city: tail, state: '', zip: '' }
  }

  const m = text.match(/,\s*([^,]+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)
  if (m) {
    return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] }
  }
  return { city: '', state: '', zip: '' }
}

/** House number + street name when available. */
function leadStreetValue(lead) {
  const ctx = primaryAddressContext(lead)
  const p = ctx.properties || {}
  const house = pickProp(p, [
    'saddno', 'SADDNO', 'HOUSE_NUM', 'HOUSE_NUMBER', 'SITUS_NUM', 'SITUS_NBR',
    'PROP_HOUSE', 'ADDR_NUM', 'STREET_NUM', 'street_num',
  ])
  const streetName = pickProp(p, ['STREET', 'ADDR_LINE1', 'saddstr', 'SITUS_STREET', 'PROP_STREET'])
  if (house && streetName) {
    // Avoid "123 123 Main St" when STREET already includes the number.
    const name = streetName.replace(/^\d+\s+/, '').trim()
    if (streetName.toLowerCase().startsWith(house.toLowerCase())) return streetName
    return `${house} ${name || streetName}`.trim()
  }
  const fromHelper = getStreetAddress(ctx)
  if (fromHelper && fromHelper !== 'Unknown') return fromHelper
  const full = String(ctx.address || '').trim()
  if (!full) return ''
  const firstComma = full.indexOf(',')
  return firstComma > 0 ? full.slice(0, firstComma).trim() : full
}

/** "City, ST 12345" (or best available subset). */
function leadCityStateZipValue(lead) {
  const ctx = primaryAddressContext(lead)
  const p = ctx.properties || {}
  let city = pickProp(p, CITY_KEYS)
  let state = pickProp(p, STATE_KEYS)
  let zip = pickProp(p, ZIP_KEYS)

  // Sparse parcel tiles often only have state — keep merging until city/zip fill in.
  if (!city || !zip) {
    const full = String(ctx.address || formatLeadAddress(lead) || '').trim()
    const parsed = parseCityStateZipFromAddress(full)
    if (!city && parsed.city) city = parsed.city
    if (!state && parsed.state) state = parsed.state
    if (!zip && parsed.zip) zip = parsed.zip
  }

  return formatCityStateZip(city, state, zip)
}

function leadAttrValue(lead, leadKey, customFieldDefs = []) {
  if (!lead || !leadKey) return ''
  switch (leadKey) {
    case 'firstName':
      return String(lead.firstName || '').trim()
    case 'lastName':
      return String(lead.lastName || '').trim()
    case 'fullName':
      return String(displayLeadName(lead) || '').trim()
    case 'email':
      return getLeadEmails(lead)[0] || ''
    case 'phone':
      return getLeadPhones(lead)[0] || ''
    case 'address':
      return String(formatLeadAddress(lead) || lead.address || '').trim()
    case 'street':
      return leadStreetValue(lead)
    case 'cityStateZip':
      return leadCityStateZipValue(lead)
    case 'notes':
      return String(lead.notes || '').trim()
    default: {
      if (leadKey.startsWith(CUSTOM_FIELD_TAG_PREFIX)) {
        const id = leadKey.slice(CUSTOM_FIELD_TAG_PREFIX.length)
        const v = getCustomFieldValue(lead, id)
        return v == null ? '' : String(v)
      }
      return ''
    }
  }
}

/**
 * Build fieldId → value map from template field leadKey bindings.
 * Only text/date fields are mapped (checkbox/signature stay empty).
 */
export function buildFormPrefillFromLead(fields = [], lead = null, customFieldDefs = []) {
  if (!lead) return {}
  const out = {}
  for (const field of fields || []) {
    if (!field?.id) continue
    const type = String(field.type || '').toLowerCase()
    if (type !== 'text' && type !== 'date') continue
    const leadKey = normalizeFormLeadKey(field.leadKey)
    if (!leadKey) continue
    const value = leadAttrValue(lead, leadKey, customFieldDefs)
    if (value === '' || value == null) continue
    out[field.id] = type === 'date' ? String(value).slice(0, 32) : String(value).slice(0, 4000)
  }
  return out
}

/** Merge lead-mapped values under any explicit overrides (manual fill wins). */
export function mergeFormPrefill(leadPrefill = {}, overrides = {}) {
  return { ...(leadPrefill || {}), ...(overrides || {}) }
}
