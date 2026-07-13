function parsePhoneDigits(value) {
  if (value == null || value === '') return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

function formatPhoneUS(value) {
  const digits = parsePhoneDigits(value)
  if (!digits) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function normalizePhoneForStorage(value) {
  const digits = parsePhoneDigits(value)
  if (!digits) return null
  return formatPhoneUS(digits)
}

const CONTACT_SOURCE_USER = 'user'
const CONTACT_SOURCE_SKIPTRACE = 'skiptrace'

function normalizePhoneKey(v) {
  return parsePhoneDigits(v)
}

function normalizeEmailKey(v) {
  return String(v || '').trim().toLowerCase()
}

function normalizePhoneDetail(detail, fallbackSource = CONTACT_SOURCE_USER) {
  const value = normalizePhoneForStorage(detail?.value ?? detail)
  if (!value) return null
  return {
    value,
    source: detail?.source === CONTACT_SOURCE_SKIPTRACE ? CONTACT_SOURCE_SKIPTRACE : fallbackSource,
    callerId: detail?.callerId || '',
    primary: detail?.primary === true,
  }
}

function normalizeEmailDetail(detail, fallbackSource = CONTACT_SOURCE_USER) {
  const value = String((detail?.value ?? detail) || '').trim()
  if (!value) return null
  return {
    value,
    source: detail?.source === CONTACT_SOURCE_SKIPTRACE ? CONTACT_SOURCE_SKIPTRACE : fallbackSource,
    callerId: detail?.callerId || '',
    primary: detail?.primary === true,
  }
}

function dedupeDetails(details, normalizeKey) {
  const out = []
  const seen = new Set()
  for (const detail of details) {
    if (!detail?.value) continue
    const key = normalizeKey(detail.value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(detail)
  }
  return out
}

function syncPrimaryFlags(details) {
  if (!details.length) return []
  if (details.some((d) => d.primary)) return details
  return details.map((d, i) => ({ ...d, primary: i === 0 }))
}

function leadContactFieldsFromDetails(phoneDetails, emailDetails) {
  const phones = syncPrimaryFlags(dedupeDetails(phoneDetails, normalizePhoneKey))
  const emails = syncPrimaryFlags(dedupeDetails(emailDetails, normalizeEmailKey))
  const phoneValues = phones.map((d) => d.value).filter(Boolean)
  const emailValues = emails.map((d) => d.value).filter(Boolean)
  return {
    phoneDetails: phones,
    emailDetails: emails,
    phones: phoneValues,
    emails: emailValues,
    phone: phoneValues[0] ?? null,
    email: emailValues[0] ?? null,
  }
}

function normalizePhoneList(raw) {
  const items = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : [])
  const seen = new Set()
  const out = []
  for (const item of items) {
    const v = normalizePhoneForStorage(item)
    if (!v) continue
    const key = parsePhoneDigits(v)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

function normalizeEmailList(raw) {
  const items = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : [])
  const seen = new Set()
  const out = []
  for (const item of items) {
    const v = String(item || '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export function getLeadPhones(lead) {
  if (!lead) return []
  if (Array.isArray(lead.phones) && lead.phones.length > 0) {
    return lead.phones.map((p) => normalizePhoneForStorage(p)).filter(Boolean)
  }
  const single = normalizePhoneForStorage(lead.phone)
  return single ? [single] : []
}

export function getLeadEmails(lead) {
  if (!lead) return []
  if (Array.isArray(lead.emails) && lead.emails.length > 0) {
    return lead.emails.map((e) => String(e || '').trim()).filter(Boolean)
  }
  const single = String(lead?.email || '').trim()
  return single ? [single] : []
}

export function normalizeLeadContactsForStorage(input = {}, existing = null) {
  const hasDetailFields = Array.isArray(input.phoneDetails) || Array.isArray(input.emailDetails)
  const hasPhoneFields = input.phones !== undefined || input.phone !== undefined
  const hasEmailFields = input.emails !== undefined || input.email !== undefined

  if (hasDetailFields) {
    const phones = (input.phoneDetails || [])
      .map((d) => normalizePhoneDetail(d))
      .filter(Boolean)
    const emails = (input.emailDetails || [])
      .map((d) => normalizeEmailDetail(d))
      .filter(Boolean)
    return leadContactFieldsFromDetails(phones, emails)
  }

  if (hasPhoneFields || hasEmailFields) {
    const phones = normalizePhoneList(
      hasPhoneFields
        ? (input.phones !== undefined ? input.phones : (input.phone != null && input.phone !== '' ? [input.phone] : []))
        : getLeadPhones(existing),
    ).map((value) => ({
      value,
      source: CONTACT_SOURCE_USER,
      callerId: '',
      primary: false,
    }))
    const emails = normalizeEmailList(
      hasEmailFields
        ? (input.emails !== undefined ? input.emails : (input.email != null && input.email !== '' ? [input.email] : []))
        : getLeadEmails(existing),
    ).map((value) => ({
      value,
      source: CONTACT_SOURCE_USER,
      callerId: '',
      primary: false,
    }))
    return leadContactFieldsFromDetails(phones, emails)
  }

  if (existing) {
    if (Array.isArray(existing.phoneDetails) || Array.isArray(existing.emailDetails)) {
      return leadContactFieldsFromDetails(
        (existing.phoneDetails || []).map((d) => normalizePhoneDetail(d)).filter(Boolean),
        (existing.emailDetails || []).map((d) => normalizeEmailDetail(d)).filter(Boolean),
      )
    }
    return normalizeLeadContactsForStorage({
      phones: getLeadPhones(existing),
      emails: getLeadEmails(existing),
    }, null)
  }

  return leadContactFieldsFromDetails([], [])
}
