/**
 * Map a CSV of contacts/properties onto lead create payloads.
 */

import { splitOwnerName } from './ownerName'
import { parsePhoneDigits } from './phoneFormat'
import { getLeadPhones, getLeadEmails } from './leadContact'
import { escapeCsvValue } from './csv'

export const MAX_IMPORT_ROWS = 200
export const IMPORT_BATCH_SIZE = 50

export const LEAD_IMPORT_FIELDS = [
  { id: 'firstName', label: 'First name' },
  { id: 'lastName', label: 'Last name' },
  { id: 'fullName', label: 'Full / owner name' },
  { id: 'address', label: 'Address' },
  { id: 'street', label: 'Street' },
  { id: 'city', label: 'City' },
  { id: 'state', label: 'State' },
  { id: 'zip', label: 'ZIP' },
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'notes', label: 'Notes' },
  { id: 'status', label: 'Status' },
  { id: 'tags', label: 'Tags' },
]

const FIELD_ALIASES = {
  firstName: ['firstname', 'first', 'givenname', 'given'],
  lastName: ['lastname', 'last', 'surname', 'familyname', 'family'],
  fullName: ['name', 'fullname', 'ownername', 'owner', 'contactname', 'contact'],
  address: ['address', 'propertyaddress', 'situsaddress', 'fulladdress', 'property'],
  street: ['street', 'streetaddress', 'address1', 'addr1', 'line1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province', 'region'],
  zip: ['zip', 'zipcode', 'postal', 'postalcode'],
  phone: ['phone', 'phonenumber', 'mobile', 'cellphone', 'telephone', 'tel'],
  email: ['email', 'emailaddress', 'e-mail'],
  notes: ['notes', 'note', 'comments', 'comment', 'description'],
  status: ['status', 'leadstatus', 'stage'],
  tags: ['tags', 'tag', 'labels', 'label'],
}

const UNMAPPED = ''

export function emptyColumnMapping() {
  const mapping = {}
  for (const field of LEAD_IMPORT_FIELDS) mapping[field.id] = UNMAPPED
  mapping.customFields = {}
  return mapping
}

export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function cellAt(row, index) {
  if (index === UNMAPPED || index == null || index === '') return ''
  const n = Number(index)
  if (!Number.isInteger(n) || n < 0) return ''
  return String(row?.[n] ?? '').trim()
}

export function composeAddress({ address = '', street = '', city = '', state = '', zip = '' } = {}) {
  const streetPart = (street || '').trim()
  const addressPart = (address || '').trim()
  const line1 = streetPart || addressPart
  const cityPart = (city || '').trim()
  const statePart = (state || '').trim()
  const zipPart = (zip || '').trim()
  const tail = [cityPart, [statePart, zipPart].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  if (streetPart && (cityPart || statePart || zipPart)) {
    return [streetPart, tail].filter(Boolean).join(', ')
  }
  if (!streetPart && addressPart && (cityPart || statePart || zipPart)) {
    const looksFull = /,\s*[A-Za-z].*,/.test(addressPart) || /\b[A-Z]{2}\s+\d{5}/i.test(addressPart)
    if (looksFull) return addressPart
    return [addressPart, tail].filter(Boolean).join(', ')
  }
  return line1
}

export function normalizeImportName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeImportAddress(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeImportEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeImportPhone(value) {
  const digits = parsePhoneDigits(value)
  return digits.length === 10 ? digits : ''
}

export function nameAddressKey(firstName, lastName, address) {
  return `${normalizeImportName(firstName)}|${normalizeImportName(lastName)}|${normalizeImportAddress(address)}`
}

function collectLeadEmails(lead) {
  const values = []
  if (lead?.email) values.push(lead.email)
  if (Array.isArray(lead?.emails)) values.push(...lead.emails)
  try {
    values.push(...getLeadEmails(lead))
  } catch {
    /* ignore */
  }
  return values.map(normalizeImportEmail).filter(Boolean)
}

function collectLeadPhones(lead) {
  const values = []
  if (lead?.phone) values.push(lead.phone)
  if (Array.isArray(lead?.phones)) values.push(...lead.phones)
  try {
    values.push(...getLeadPhones(lead))
  } catch {
    /* ignore */
  }
  return values.map(normalizeImportPhone).filter(Boolean)
}

export function buildDuplicateIndex(leads = []) {
  const emails = new Set()
  const phones = new Set()
  const nameAddresses = new Set()
  for (const lead of leads || []) {
    for (const email of collectLeadEmails(lead)) emails.add(email)
    for (const phone of collectLeadPhones(lead)) phones.add(phone)
    const key = nameAddressKey(lead?.firstName, lead?.lastName, lead?.address)
    if (key !== '||') nameAddresses.add(key)
  }
  return { emails, phones, nameAddresses }
}

export function findDuplicateReason(lead, index) {
  const email = normalizeImportEmail(lead?.email)
  if (email && index.emails.has(email)) return 'A lead with this email already exists'
  const phone = normalizeImportPhone(lead?.phone)
  if (phone && index.phones.has(phone)) return 'A lead with this phone already exists'
  const key = nameAddressKey(lead?.firstName, lead?.lastName, lead?.address)
  if (key !== '||' && index.nameAddresses.has(key)) {
    return 'A lead with this name and address already exists'
  }
  return null
}

export function addLeadToDuplicateIndex(lead, index) {
  const email = normalizeImportEmail(lead?.email)
  if (email) index.emails.add(email)
  const phone = normalizeImportPhone(lead?.phone)
  if (phone) index.phones.add(phone)
  const key = nameAddressKey(lead?.firstName, lead?.lastName, lead?.address)
  if (key !== '||') index.nameAddresses.add(key)
}

export function resolveImportStatus(value, statuses = []) {
  const raw = String(value || '').trim()
  if (!raw) return { status: 'new', warning: null }
  const needle = raw.toLowerCase()
  const match = (statuses || []).find((s) => (
    String(s.id || '').toLowerCase() === needle
    || String(s.label || '').toLowerCase() === needle
  ))
  if (match) return { status: match.id, warning: null }
  return { status: 'new', warning: `Unknown status "${raw}" — imported as New` }
}

export function resolveImportTagIds(value, tagRegistry = { leads: [] }) {
  const raw = String(value || '').trim()
  if (!raw) return { tagIds: [], unknown: [] }
  const names = raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
  const defs = tagRegistry?.leads || []
  const tagIds = []
  const unknown = []
  const seen = new Set()
  for (const name of names) {
    const match = defs.find((t) => String(t.name || '').trim().toLowerCase() === name.toLowerCase())
    if (!match?.id) {
      unknown.push(name)
      continue
    }
    if (seen.has(match.id)) continue
    seen.add(match.id)
    tagIds.push(match.id)
  }
  return { tagIds, unknown }
}

function fieldForAlias(normalized) {
  for (const [fieldId, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized)) return fieldId
  }
  return null
}

function customFieldForHeader(normalized, customFields = []) {
  return (customFields || []).find((f) => normalizeHeader(f.label) === normalized && normalized)
}

/**
 * Auto-map CSV headers onto lead fields. List-export columns
 * (Address, City, State, Zip, Owner Name) are first-class.
 */
export function guessColumnMapping(headers = [], { customFields = [] } = {}) {
  const mapping = emptyColumnMapping()
  const used = new Set()

  const assign = (fieldId, index) => {
    if (mapping[fieldId] !== UNMAPPED || used.has(index)) return false
    mapping[fieldId] = String(index)
    used.add(index)
    return true
  }

  headers.forEach((header, index) => {
    const norm = normalizeHeader(header)
    const fieldId = fieldForAlias(norm)
    if (fieldId) assign(fieldId, index)
  })

  headers.forEach((header, index) => {
    if (used.has(index)) return
    const match = customFieldForHeader(normalizeHeader(header), customFields)
    if (match?.id) {
      mapping.customFields[match.id] = String(index)
      used.add(index)
    }
  })

  return mapping
}

export function mappingHasName(mapping) {
  return !!(mapping?.firstName || mapping?.lastName || mapping?.fullName)
}

function splitMappedName(mapping, row) {
  const first = cellAt(row, mapping.firstName)
  const last = cellAt(row, mapping.lastName)
  if (first || last) return { firstName: first, lastName: last }
  const full = cellAt(row, mapping.fullName)
  if (!full) return { firstName: '', lastName: '' }
  return splitOwnerName(full)
}

function mappedCustomFields(mapping, row, customFields = []) {
  const values = {}
  const defs = customFields || []
  for (const def of defs) {
    const idx = mapping?.customFields?.[def.id]
    if (idx == null || idx === UNMAPPED) continue
    const raw = cellAt(row, idx)
    if (raw) values[def.id] = raw
  }
  return values
}

export function buildLeadFromRow(row, mapping, {
  leadStatuses = [],
  tagRegistry = { leads: [] },
  customFields = [],
} = {}) {
  const warnings = []
  const { firstName, lastName } = splitMappedName(mapping, row)
  const address = composeAddress({
    address: cellAt(row, mapping.address),
    street: cellAt(row, mapping.street),
    city: cellAt(row, mapping.city),
    state: cellAt(row, mapping.state),
    zip: cellAt(row, mapping.zip),
  })
  const phone = cellAt(row, mapping.phone)
  const email = cellAt(row, mapping.email)
  const notes = cellAt(row, mapping.notes)
  const { status, warning: statusWarning } = resolveImportStatus(cellAt(row, mapping.status), leadStatuses)
  if (statusWarning) warnings.push(statusWarning)
  const { tagIds, unknown } = resolveImportTagIds(cellAt(row, mapping.tags), tagRegistry)
  if (unknown.length) {
    warnings.push(`Unknown tag${unknown.length === 1 ? '' : 's'} skipped: ${unknown.join(', ')}`)
  }

  const lead = {
    firstName,
    lastName,
    address,
    phone: phone || null,
    email: email || null,
    notes,
    status,
    tagIds,
    customFields: mappedCustomFields(mapping, row, customFields),
  }

  if (!firstName && !lastName) {
    return { lead: null, error: 'First or last name is required', warnings }
  }

  return { lead, error: null, warnings }
}

export function previewImportRows(rows, mapping, {
  existingLeads = [],
  leadStatuses = [],
  tagRegistry = { leads: [] },
  customFields = [],
} = {}) {
  if ((rows || []).length > MAX_IMPORT_ROWS) {
    return {
      error: `CSV has ${(rows || []).length} rows. Import up to ${MAX_IMPORT_ROWS} leads at a time.`,
      records: [],
      counts: { valid: 0, invalid: 0, duplicate: 0, total: rows.length },
    }
  }

  const index = buildDuplicateIndex(existingLeads)
  const records = []
  let valid = 0
  let invalid = 0
  let duplicate = 0

  ;(rows || []).forEach((row, rowIndex) => {
    const built = buildLeadFromRow(row, mapping, { leadStatuses, tagRegistry, customFields })
    if (built.error) {
      invalid += 1
      records.push({
        rowIndex,
        status: 'invalid',
        error: built.error,
        warnings: built.warnings,
        lead: built.lead,
        row,
      })
      return
    }
    const dup = findDuplicateReason(built.lead, index)
    if (dup) {
      duplicate += 1
      records.push({
        rowIndex,
        status: 'duplicate',
        error: dup,
        warnings: built.warnings,
        lead: built.lead,
        row,
      })
      return
    }
    addLeadToDuplicateIndex(built.lead, index)
    valid += 1
    records.push({
      rowIndex,
      status: 'valid',
      error: null,
      warnings: built.warnings,
      lead: built.lead,
      row,
    })
  })

  return {
    error: null,
    records,
    counts: { valid, invalid, duplicate, total: rows.length },
  }
}

export function sampleLeadCsv() {
  const headers = ['First Name', 'Last Name', 'Address', 'City', 'State', 'Zip', 'Phone', 'Email', 'Notes', 'Status']
  const rows = [
    ['Jane', 'Doe', '123 Main St', 'Fort Worth', 'TX', '76102', '(817) 555-0100', 'jane@example.com', 'Met at the door', 'new'],
    ['John', 'Smith', '456 Oak Ave', 'Arlington', 'TX', '76010', '8175550199', 'john@example.com', '', 'contacted'],
  ]
  return [headers.map(escapeCsvValue).join(','), ...rows.map((r) => r.map(escapeCsvValue).join(','))].join('\n') + '\n'
}

export function downloadSampleLeadCsv() {
  const csv = sampleLeadCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'knockscout-leads-template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function chunkItems(items, size) {
  const out = []
  const n = Math.max(1, Number(size) || IMPORT_BATCH_SIZE)
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}
