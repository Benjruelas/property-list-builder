/**
 * Map a CSV of contacts/properties onto lead create payloads.
 */

import { splitOwnerName } from './ownerName'
import { parsePhoneDigits } from './phoneFormat'
import { getLeadPhones, getLeadEmails } from './leadContact'
import { escapeCsvValue } from './csv'
import {
  applyJobberColumnPreset,
  groupRowsByClientId,
  isArchivedImportValue,
  isJobberClientCsv,
  looksLikeStreetLine,
  normalizeJobberState,
  splitContactDisplayName,
  stripJobberStreetSuffix,
} from './jobberLeadImport'

export const MAX_IMPORT_ROWS = 1000
export const IMPORT_BATCH_SIZE = 50

export const LEAD_IMPORT_FIELDS = [
  { id: 'firstName', label: 'First name' },
  { id: 'lastName', label: 'Last name' },
  { id: 'fullName', label: 'Full / owner name' },
  { id: 'companyName', label: 'Company name' },
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
  companyName: ['companyname', 'company', 'business', 'businessname'],
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
  mapping.phoneColumns = []
  mapping.emailColumns = []
  mapping.street2 = UNMAPPED
  mapping.propertyName = UNMAPPED
  mapping.archived = UNMAPPED
  mapping.clientId = UNMAPPED
  mapping.source = ''
  return mapping
}

export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function unwrapImportHeader(header) {
  const raw = String(header || '').trim()
  const wrapped = raw.match(/^(?:CFT|PFI)\s*\[(.*)\]\s*$/i)
  const inner = (wrapped ? wrapped[1] : raw).replace(/:+\s*$/, '').trim()
  return normalizeHeader(inner)
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
  for (const email of collectLeadEmails(lead)) {
    if (index.emails.has(email)) return 'A lead with this email already exists'
  }
  for (const phone of collectLeadPhones(lead)) {
    if (index.phones.has(phone)) return 'A lead with this phone already exists'
  }
  const key = nameAddressKey(lead?.firstName, lead?.lastName, lead?.address)
  if (key !== '||' && index.nameAddresses.has(key)) {
    return 'A lead with this name and address already exists'
  }
  return null
}

export function addLeadToDuplicateIndex(lead, index) {
  for (const email of collectLeadEmails(lead)) index.emails.add(email)
  for (const phone of collectLeadPhones(lead)) index.phones.add(phone)
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

export function isNumericTagName(name) {
  return /^\d+$/.test(String(name || '').trim())
}

export function resolveImportTagIds(value, tagRegistry = { leads: [] }) {
  const raw = Array.isArray(value) ? value.join(', ') : String(value || '').trim()
  if (!raw) return { tagIds: [], unknown: [] }
  const names = raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
  const defs = tagRegistry?.leads || []
  const tagIds = []
  const unknown = []
  const seen = new Set()
  const seenUnknown = new Set()
  for (const name of names) {
    if (isNumericTagName(name)) continue
    const match = defs.find((t) => String(t.name || '').trim().toLowerCase() === name.toLowerCase())
    if (!match?.id) {
      const key = name.toLowerCase()
      if (!seenUnknown.has(key)) {
        seenUnknown.add(key)
        unknown.push(name)
      }
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

function customFieldForHeader(header, customFields = []) {
  const unwrapped = unwrapImportHeader(header)
  if (!unwrapped) return null
  return (customFields || []).find((f) => normalizeHeader(f.label) === unwrapped)
}

/**
 * Auto-map CSV headers onto lead fields. List-export columns
 * (Address, City, State, Zip, Owner Name) are first-class.
 * Jobber Clients exports get a dedicated preset.
 */
export function guessColumnMapping(headers = [], { customFields = [] } = {}) {
  if (isJobberClientCsv(headers)) {
    return applyJobberColumnPreset(headers, { customFields })
  }

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
    const match = customFieldForHeader(header, customFields)
    if (match?.id) {
      mapping.customFields[match.id] = String(index)
      used.add(index)
    }
  })

  return mapping
}

export function mappingHasName(mapping) {
  return !!(mapping?.firstName || mapping?.lastName || mapping?.fullName || mapping?.companyName)
}

function splitMappedName(mapping, row) {
  const first = cellAt(row, mapping.firstName)
  const last = cellAt(row, mapping.lastName)
  if (first || last) return { firstName: first, lastName: last }
  const full = cellAt(row, mapping.fullName)
  if (full) {
    return mapping?.source === 'jobber' ? splitContactDisplayName(full) : splitOwnerName(full)
  }
  const company = cellAt(row, mapping.companyName)
  if (company) return splitContactDisplayName(company)
  return { firstName: '', lastName: '' }
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

function splitContactCells(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function columnIndexList(primary, extras = []) {
  return [...new Set(
    [primary, ...(Array.isArray(extras) ? extras : [])]
      .map((v) => (v == null || v === '' ? '' : String(v)))
      .filter(Boolean),
  )]
}

function collectMappedPhones(row, mapping) {
  const values = []
  const seen = new Set()
  for (const index of columnIndexList(mapping.phone, mapping.phoneColumns)) {
    for (const part of splitContactCells(cellAt(row, index))) {
      const digits = normalizeImportPhone(part)
      if (!digits || seen.has(digits)) continue
      seen.add(digits)
      values.push(part)
    }
  }
  return values
}

function collectMappedEmails(row, mapping) {
  const values = []
  const seen = new Set()
  for (const index of columnIndexList(mapping.email, mapping.emailColumns)) {
    for (const part of splitContactCells(cellAt(row, index))) {
      const key = normalizeImportEmail(part)
      if (!key || seen.has(key)) continue
      seen.add(key)
      values.push(part)
    }
  }
  return values
}

function uniqueStrings(values) {
  const out = []
  const seen = new Set()
  for (const value of values || []) {
    const trimmed = String(value || '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function buildRowAddress(row, mapping) {
  let street = cellAt(row, mapping.street)
  let city = cellAt(row, mapping.city)
  let state = cellAt(row, mapping.state)
  let zip = cellAt(row, mapping.zip)
  const address = cellAt(row, mapping.address)
  const notesExtra = []

  if (mapping?.source === 'jobber') {
    street = stripJobberStreetSuffix(street)
    state = normalizeJobberState(state)
    const extras = [cellAt(row, mapping.street2), cellAt(row, mapping.propertyName)].filter(Boolean)
    for (const extra of extras) {
      if (looksLikeStreetLine(extra)) {
        street = [street, extra].filter(Boolean).join(', ')
      } else {
        notesExtra.push(extra)
      }
    }
  }

  return {
    address: composeAddress({ address, street, city, state, zip }),
    notesExtra,
  }
}

function tagWarning(unknown) {
  if (!unknown.length) return null
  return `Unknown tag${unknown.length === 1 ? '' : 's'} will be created: ${unknown.join(', ')}`
}

export function extractRowForImport(row, mapping, {
  leadStatuses = [],
  tagRegistry = { leads: [] },
  customFields = [],
} = {}) {
  const warnings = []
  const { firstName, lastName } = splitMappedName(mapping, row)
  const { address, notesExtra } = buildRowAddress(row, mapping)
  const phones = collectMappedPhones(row, mapping)
  const emails = collectMappedEmails(row, mapping)
  const notes = uniqueStrings([cellAt(row, mapping.notes), ...notesExtra]).join('\n')
  const { status, warning: statusWarning } = resolveImportStatus(cellAt(row, mapping.status), leadStatuses)
  if (statusWarning) warnings.push(statusWarning)
  const { tagIds, unknown } = resolveImportTagIds(cellAt(row, mapping.tags), tagRegistry)
  const pending = tagWarning(unknown)
  if (pending) warnings.push(pending)

  return {
    firstName,
    lastName,
    address,
    phones,
    emails,
    notes,
    status,
    archived: isArchivedImportValue(cellAt(row, mapping.archived)),
    tagIds,
    pendingTagNames: unknown,
    customFields: mappedCustomFields(mapping, row, customFields),
    warnings,
  }
}

function leadFromExtracted(extracted) {
  const phones = extracted.phones || []
  const emails = extracted.emails || []
  const addressDetails = extracted.addressDetails
    || (extracted.address ? [{ value: extracted.address, primary: true }] : [])
  const primary = addressDetails[0] || null
  return {
    firstName: extracted.firstName,
    lastName: extracted.lastName,
    address: primary?.value || extracted.address || '',
    addressDetails: addressDetails.length ? addressDetails : undefined,
    phone: phones[0] || null,
    email: emails[0] || null,
    phones,
    emails,
    notes: extracted.notes || '',
    status: extracted.status || 'new',
    tagIds: extracted.tagIds || [],
    pendingTagNames: extracted.pendingTagNames || [],
    customFields: extracted.customFields || {},
  }
}

export function buildLeadFromRow(row, mapping, options = {}) {
  const extracted = extractRowForImport(row, mapping, options)
  if (!extracted.firstName && !extracted.lastName) {
    return { lead: null, error: 'First or last name is required', warnings: extracted.warnings }
  }
  const lead = leadFromExtracted(extracted)
  if (!lead.addressDetails || lead.addressDetails.length <= 1) {
    delete lead.addressDetails
  }
  return { lead, error: null, warnings: extracted.warnings }
}

function mergeExtractedRows(parts) {
  const firstNamed = parts.find((p) => p.firstName || p.lastName) || parts[0] || {}
  const addresses = []
  const seenAddresses = new Set()
  for (const part of parts) {
    const value = String(part.address || '').trim()
    if (!value) continue
    const key = normalizeImportAddress(value)
    if (seenAddresses.has(key)) continue
    seenAddresses.add(key)
    addresses.push({ value, primary: addresses.length === 0 })
  }

  const phones = []
  const phoneSeen = new Set()
  const emails = []
  const emailSeen = new Set()
  for (const part of parts) {
    for (const phone of part.phones || []) {
      const digits = normalizeImportPhone(phone)
      if (!digits || phoneSeen.has(digits)) continue
      phoneSeen.add(digits)
      phones.push(phone)
    }
    for (const email of part.emails || []) {
      const key = normalizeImportEmail(email)
      if (!key || emailSeen.has(key)) continue
      emailSeen.add(key)
      emails.push(email)
    }
  }

  const customFields = {}
  for (const part of parts) {
    for (const [id, value] of Object.entries(part.customFields || {})) {
      if (customFields[id] || !value) continue
      customFields[id] = value
    }
  }

  const tagIds = uniqueStrings(parts.flatMap((p) => p.tagIds || []))
  const pendingTagNames = uniqueStrings(parts.flatMap((p) => p.pendingTagNames || []))
  const warnings = uniqueStrings(parts.flatMap((p) => p.warnings || []))
  const notes = uniqueStrings(parts.flatMap((p) => String(p.notes || '').split('\n'))).join('\n')
  const allArchived = parts.length > 0 && parts.every((p) => p.archived)
  const status = allArchived ? 'lost' : (firstNamed.status || 'new')

  return {
    firstName: firstNamed.firstName || '',
    lastName: firstNamed.lastName || '',
    address: addresses[0]?.value || '',
    addressDetails: addresses,
    phones,
    emails,
    notes,
    status,
    tagIds,
    pendingTagNames,
    customFields,
    warnings,
  }
}

function previewRecordsFromLeads(items, existingLeads = []) {
  const index = buildDuplicateIndex(existingLeads)
  const records = []
  let valid = 0
  let invalid = 0
  let duplicate = 0
  const tagsToCreate = []
  const seenTags = new Set()

  for (const item of items) {
    const pending = item.lead?.pendingTagNames || []
    for (const name of pending) {
      const key = name.toLowerCase()
      if (seenTags.has(key)) continue
      seenTags.add(key)
      tagsToCreate.push(name)
    }

    if (item.error) {
      invalid += 1
      records.push({ ...item, status: 'invalid' })
      continue
    }
    const dup = findDuplicateReason(item.lead, index)
    if (dup) {
      duplicate += 1
      records.push({
        ...item,
        status: 'duplicate',
        error: dup,
      })
      continue
    }
    addLeadToDuplicateIndex(item.lead, index)
    valid += 1
    records.push({
      ...item,
      status: 'valid',
      error: null,
    })
  }

  return {
    records,
    counts: { valid, invalid, duplicate, total: items.length },
    tagsToCreate,
  }
}

function previewJobberRows(rows, mapping, options = {}) {
  const groups = groupRowsByClientId(rows, mapping.clientId)
  const items = []
  for (const members of groups.values()) {
    const parts = members.map(({ row }) => extractRowForImport(row, mapping, options))
    const merged = mergeExtractedRows(parts)
    const rowIndex = members[0]?.rowIndex ?? 0
    if (!merged.firstName && !merged.lastName) {
      items.push({
        rowIndex,
        error: 'First or last name is required',
        warnings: merged.warnings,
        lead: null,
        row: members[0]?.row,
        sourceRowCount: members.length,
      })
      continue
    }
    items.push({
      rowIndex,
      error: null,
      warnings: merged.warnings,
      lead: leadFromExtracted(merged),
      row: members[0]?.row,
      sourceRowCount: members.length,
    })
  }

  const previewed = previewRecordsFromLeads(items, options.existingLeads)
  return {
    error: null,
    records: previewed.records,
    counts: {
      ...previewed.counts,
      sourceRows: rows.length,
    },
    tagsToCreate: previewed.tagsToCreate,
    source: 'jobber',
  }
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
      counts: { valid: 0, invalid: 0, duplicate: 0, total: rows.length, sourceRows: rows.length },
      tagsToCreate: [],
      source: mapping?.source || '',
    }
  }

  const options = { existingLeads, leadStatuses, tagRegistry, customFields }
  if (mapping?.source === 'jobber' && mapping.clientId !== undefined && mapping.clientId !== '') {
    return previewJobberRows(rows, mapping, options)
  }

  const items = (rows || []).map((row, rowIndex) => {
    const built = buildLeadFromRow(row, mapping, options)
    return {
      rowIndex,
      error: built.error,
      warnings: built.warnings,
      lead: built.lead,
      row,
    }
  })
  const previewed = previewRecordsFromLeads(items, existingLeads)
  return {
    error: null,
    records: previewed.records,
    counts: {
      ...previewed.counts,
      sourceRows: rows.length,
    },
    tagsToCreate: previewed.tagsToCreate,
    source: mapping?.source || '',
  }
}

export function applyCreatedTagsToLeads(leads, tagRegistry = { leads: [] }) {
  return (leads || []).map((lead) => {
    const pending = lead?.pendingTagNames || []
    const resolved = resolveImportTagIds(pending, tagRegistry)
    const next = {
      ...lead,
      tagIds: [...new Set([...(lead.tagIds || []), ...resolved.tagIds])],
    }
    delete next.pendingTagNames
    return next
  })
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

export { isJobberClientCsv, applyJobberColumnPreset }
