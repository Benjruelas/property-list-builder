import {
  normalizePhoneForStorage,
  formatPhoneDisplay,
  parsePhoneDigits,
  phoneMatchesQuery,
} from './phoneFormat'

export const CONTACT_SOURCE_USER = 'user'
export const CONTACT_SOURCE_SKIPTRACE = 'skiptrace'

const normalizePhoneKey = (v) => parsePhoneDigits(v)
const normalizeEmailKey = (v) => String(v || '').trim().toLowerCase()

export { normalizePhoneKey, normalizeEmailKey }

export function normalizePhoneDetail(detail, fallbackSource = CONTACT_SOURCE_USER) {
  const value = normalizePhoneForStorage(detail?.value ?? detail)
  if (!value) return null
  return {
    value,
    source: detail?.source === CONTACT_SOURCE_SKIPTRACE ? CONTACT_SOURCE_SKIPTRACE : fallbackSource,
    callerId: detail?.callerId || '',
    primary: detail?.primary === true,
  }
}

export function normalizeEmailDetail(detail, fallbackSource = CONTACT_SOURCE_USER) {
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

function detailsToValues(details) {
  return details.map((d) => d.value).filter(Boolean)
}

function syncPrimaryFlags(details) {
  if (!details.length) return []
  if (details.some((d) => d.primary)) return details
  return details.map((d, i) => ({ ...d, primary: i === 0 }))
}

export function isSkipTracedLeadContact(detail) {
  return detail?.source === CONTACT_SOURCE_SKIPTRACE
}

export function getLeadPhoneDetails(lead) {
  if (!lead) return []
  if (Array.isArray(lead.phoneDetails) && lead.phoneDetails.length > 0) {
    return syncPrimaryFlags(
      dedupeDetails(
        lead.phoneDetails.map((d) => normalizePhoneDetail(d)).filter(Boolean),
        normalizePhoneKey,
      ),
    )
  }
  const legacyValues = normalizePhoneList(
    lead.phones !== undefined
      ? lead.phones
      : (lead.phone != null && lead.phone !== '' ? [lead.phone] : []),
  )
  return legacyValues.map((value, i) => ({
    value,
    source: CONTACT_SOURCE_USER,
    callerId: '',
    primary: i === 0,
  }))
}

export function getLeadEmailDetails(lead) {
  if (!lead) return []
  if (Array.isArray(lead.emailDetails) && lead.emailDetails.length > 0) {
    return syncPrimaryFlags(
      dedupeDetails(
        lead.emailDetails.map((d) => normalizeEmailDetail(d)).filter(Boolean),
        normalizeEmailKey,
      ),
    )
  }
  const legacyValues = normalizeEmailList(
    lead.emails !== undefined
      ? lead.emails
      : (lead.email != null && lead.email !== '' ? [lead.email] : []),
  )
  return legacyValues.map((value, i) => ({
    value,
    source: CONTACT_SOURCE_USER,
    callerId: '',
    primary: i === 0,
  }))
}

export function getLeadPhones(lead) {
  return detailsToValues(getLeadPhoneDetails(lead))
}

export function getLeadEmails(lead) {
  return detailsToValues(getLeadEmailDetails(lead))
}

export function getPrimaryLeadPhone(lead) {
  return getLeadPhones(lead)[0] ?? null
}

export function getPrimaryLeadEmail(lead) {
  return getLeadEmails(lead)[0] ?? null
}

export function normalizePhoneList(raw) {
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

export function normalizeEmailList(raw) {
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

export function leadContactFieldsFromDetails(phoneDetails, emailDetails) {
  const phones = syncPrimaryFlags(dedupeDetails(phoneDetails, normalizePhoneKey))
  const emails = syncPrimaryFlags(dedupeDetails(emailDetails, normalizeEmailKey))
  const phoneValues = detailsToValues(phones)
  const emailValues = detailsToValues(emails)
  return {
    phoneDetails: phones,
    emailDetails: emails,
    phones: phoneValues,
    emails: emailValues,
    phone: phoneValues[0] ?? null,
    email: emailValues[0] ?? null,
  }
}

/** Normalize phones/emails arrays and keep legacy phone/email as primary entries. */
export function normalizeLeadContactsForStorage(input = {}) {
  if (Array.isArray(input.phoneDetails) || Array.isArray(input.emailDetails)) {
    const phones = (input.phoneDetails || [])
      .map((d) => normalizePhoneDetail(d))
      .filter(Boolean)
    const emails = (input.emailDetails || [])
      .map((d) => normalizeEmailDetail(d))
      .filter(Boolean)
    return leadContactFieldsFromDetails(phones, emails)
  }

  const phones = normalizePhoneList(
    input.phones !== undefined
      ? input.phones
      : (input.phone != null && input.phone !== '' ? [input.phone] : []),
  ).map((value) => ({
    value,
    source: CONTACT_SOURCE_USER,
    callerId: '',
    primary: false,
  }))
  const emails = normalizeEmailList(
    input.emails !== undefined
      ? input.emails
      : (input.email != null && input.email !== '' ? [input.email] : []),
  ).map((value) => ({
    value,
    source: CONTACT_SOURCE_USER,
    callerId: '',
    primary: false,
  }))
  return leadContactFieldsFromDetails(phones, emails)
}

export function leadContactMatchesQuery(lead, query) {
  const q = String(query || '').trim()
  if (!q) return true
  if (getLeadPhones(lead).some((p) => phoneMatchesQuery(p, q))) return true
  const ql = q.toLowerCase()
  return getLeadEmails(lead).some((e) => e.toLowerCase().includes(ql))
}

export function phoneDetailsForLeadForm(lead) {
  const details = getLeadPhoneDetails(lead).map((d) => ({
    ...d,
    value: formatPhoneDisplay(d.value),
  }))
  return details.length ? details : [{ value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false }]
}

export function emailDetailsForLeadForm(lead) {
  const details = getLeadEmailDetails(lead)
  return details.length ? details : [{ value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false }]
}

/** @deprecated use phoneDetailsForLeadForm */
export function phonesForLeadForm(lead) {
  return phoneDetailsForLeadForm(lead).map((d) => d.value)
}

/** @deprecated use emailDetailsForLeadForm */
export function emailsForLeadForm(lead) {
  return emailDetailsForLeadForm(lead).map((d) => d.value)
}

export function contactDetailsFromForm(form) {
  const phoneDetails = (form.phoneDetails || [])
    .map((d) => normalizePhoneDetail(d, d?.source || CONTACT_SOURCE_USER))
    .filter(Boolean)
  const emailDetails = (form.emailDetails || [])
    .map((d) => normalizeEmailDetail(d, d?.source || CONTACT_SOURCE_USER))
    .filter(Boolean)
  return leadContactFieldsFromDetails(phoneDetails, emailDetails)
}

/** @deprecated use contactDetailsFromForm */
export function contactListsFromForm(form) {
  return normalizeLeadContactsForStorage({
    phones: form.phones,
    emails: form.emails,
  })
}

export function mergeLeadContactsWithSkipTrace(existingDetails, incomingSkipDetails, { normalizeKey, normalizeDetail }) {
  const existing = (existingDetails || []).map((d) => normalizeDetail(d, d?.source || CONTACT_SOURCE_USER)).filter(Boolean)
  const incoming = (incomingSkipDetails || []).map((d) => normalizeDetail(d, CONTACT_SOURCE_SKIPTRACE)).filter(Boolean)
  const merged = []
  const seen = new Set()

  for (const detail of existing) {
    const key = normalizeKey(detail.value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const fresh = incoming.find((item) => normalizeKey(item.value) === key)
    if (detail.source === CONTACT_SOURCE_USER) {
      merged.push({ ...detail, source: CONTACT_SOURCE_USER })
      continue
    }
    if (fresh) {
      merged.push({
        ...detail,
        ...fresh,
        value: detail.value,
        source: CONTACT_SOURCE_SKIPTRACE,
        primary: detail.primary ?? false,
      })
    } else {
      merged.push({ ...detail, source: CONTACT_SOURCE_SKIPTRACE })
    }
  }

  for (const detail of incoming) {
    const key = normalizeKey(detail.value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push({ ...detail, source: CONTACT_SOURCE_SKIPTRACE })
  }

  return syncPrimaryFlags(merged)
}

export function skipTraceContactDetails(skipTraceData) {
  if (!skipTraceData) {
    return leadContactFieldsFromDetails([], [])
  }
  let phoneDetails = []
  if (Array.isArray(skipTraceData.phoneDetails) && skipTraceData.phoneDetails.length) {
    phoneDetails = skipTraceData.phoneDetails
      .map((d) => normalizePhoneDetail({ ...d, source: CONTACT_SOURCE_SKIPTRACE }, CONTACT_SOURCE_SKIPTRACE))
      .filter(Boolean)
  } else {
    const values = skipTraceData.phoneNumbers?.length
      ? skipTraceData.phoneNumbers
      : (skipTraceData.phone ? [skipTraceData.phone] : [])
    phoneDetails = values
      .map((value) => normalizePhoneDetail({ value, source: CONTACT_SOURCE_SKIPTRACE }, CONTACT_SOURCE_SKIPTRACE))
      .filter(Boolean)
  }

  let emailDetails = []
  if (Array.isArray(skipTraceData.emailDetails) && skipTraceData.emailDetails.length) {
    emailDetails = skipTraceData.emailDetails
      .map((d) => normalizeEmailDetail({ ...d, source: CONTACT_SOURCE_SKIPTRACE }, CONTACT_SOURCE_SKIPTRACE))
      .filter(Boolean)
  } else {
    const values = skipTraceData.emails?.length
      ? skipTraceData.emails
      : (skipTraceData.email ? [skipTraceData.email] : [])
    emailDetails = values
      .map((value) => normalizeEmailDetail({ value, source: CONTACT_SOURCE_SKIPTRACE }, CONTACT_SOURCE_SKIPTRACE))
      .filter(Boolean)
  }

  return leadContactFieldsFromDetails(phoneDetails, emailDetails)
}
