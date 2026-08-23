import { getResourceAccess } from './resourceContext.js'
import { normalizeLeadInput } from './normalizeLeadInput.js'

export const MAX_IMPORT_BATCH = 50
/** Total leads a user may import per hour (not per HTTP request). */
export const MAX_IMPORT_LEADS_PER_HOUR = 500

function parsePhoneDigits(value) {
  if (value == null || value === '') return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeAddress(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function nameAddressKey(lead) {
  return `${normalizeName(lead?.firstName)}|${normalizeName(lead?.lastName)}|${normalizeAddress(lead?.address)}`
}

function collectEmails(lead) {
  const values = [lead?.email, ...(Array.isArray(lead?.emails) ? lead.emails : [])]
  if (Array.isArray(lead?.emailDetails)) {
    for (const d of lead.emailDetails) values.push(d?.value ?? d)
  }
  return values.map(normalizeEmail).filter(Boolean)
}

function collectPhones(lead) {
  const values = [lead?.phone, ...(Array.isArray(lead?.phones) ? lead.phones : [])]
  if (Array.isArray(lead?.phoneDetails)) {
    for (const d of lead.phoneDetails) values.push(d?.value ?? d)
  }
  return values.map(parsePhoneDigits).filter((d) => d.length === 10)
}

export function buildImportDuplicateIndex(leads = []) {
  const emails = new Set()
  const phones = new Set()
  const nameAddresses = new Set()
  for (const lead of leads || []) {
    for (const email of collectEmails(lead)) emails.add(email)
    for (const phone of collectPhones(lead)) phones.add(phone)
    const key = nameAddressKey(lead)
    if (key !== '||') nameAddresses.add(key)
  }
  return { emails, phones, nameAddresses }
}

export function findImportDuplicateReason(lead, index) {
  for (const email of collectEmails(lead)) {
    if (index.emails.has(email)) return 'A lead with this email already exists'
  }
  for (const phone of collectPhones(lead)) {
    if (index.phones.has(phone)) return 'A lead with this phone already exists'
  }
  const key = nameAddressKey(lead)
  if (key !== '||' && index.nameAddresses.has(key)) {
    return 'A lead with this name and address already exists'
  }
  return null
}

function addToDuplicateIndex(lead, index) {
  for (const email of collectEmails(lead)) index.emails.add(email)
  for (const phone of collectPhones(lead)) index.phones.add(phone)
  const key = nameAddressKey(lead)
  if (key !== '||') index.nameAddresses.add(key)
}

function parcelConflicts(lead, allLeads, user, ctx, reservedParcelIds) {
  if (!lead?.parcelId) return null
  if (reservedParcelIds.has(lead.parcelId)) {
    return 'A lead already exists for this parcel'
  }
  const conflict = (allLeads || []).find((l) => l.parcelId === lead.parcelId)
  if (!conflict) return null
  const canSee = getResourceAccess(conflict, user, ctx) !== null
  if (canSee || conflict.ownerId === user.uid) {
    return 'A lead already exists for this parcel'
  }
  return null
}

/**
 * Normalize and de-dupe a batch of lead inputs. Does not write or fire auto-tasks.
 *
 * @returns {{ created: object[], errors: { index: number, message: string }[] }}
 */
export function prepareImportedLeads({
  inputs,
  user,
  ctx,
  visibleLeads = [],
  allLeads = [],
  tagRegistry = null,
  allowedStatusIds = null,
  fieldDefs = [],
  visibility,
  sharedMemberUids,
  sharedWith,
}) {
  const created = []
  const errors = []
  const index = buildImportDuplicateIndex(visibleLeads)
  const reservedParcelIds = new Set()

  ;(inputs || []).forEach((raw, indexInBatch) => {
    if (!raw || typeof raw !== 'object') {
      errors.push({ index: indexInBatch, message: 'Lead payload is required' })
      return
    }
    const body = {
      ...raw,
      ...(visibility !== undefined ? { visibility } : {}),
      ...(sharedMemberUids !== undefined ? { sharedMemberUids } : {}),
      ...(sharedWith !== undefined ? { sharedWith } : {}),
    }
    let lead
    try {
      lead = normalizeLeadInput(body, user, null, ctx, tagRegistry, allowedStatusIds, fieldDefs)
    } catch (e) {
      errors.push({ index: indexInBatch, message: e.message || 'Invalid lead' })
      return
    }

    const dup = findImportDuplicateReason(lead, index)
    if (dup) {
      errors.push({ index: indexInBatch, message: dup })
      return
    }
    const parcelError = parcelConflicts(lead, allLeads, user, ctx, reservedParcelIds)
    if (parcelError) {
      errors.push({ index: indexInBatch, message: parcelError })
      return
    }

    addToDuplicateIndex(lead, index)
    if (lead.parcelId) reservedParcelIds.add(lead.parcelId)
    created.push(lead)
  })

  return { created, errors }
}
