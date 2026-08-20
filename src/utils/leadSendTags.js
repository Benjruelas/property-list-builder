/**
 * Lead attribute + custom-field tags for message builders (send / templates).
 * Custom fields use a `cf_` prefix so ids never collide with built-in keys.
 */

import { getCustomFieldValue, normalizeCustomFieldDefs } from './customFields'
import { getLeadEmails, getLeadPhones } from './leadContact'

export const CUSTOM_FIELD_TAG_PREFIX = 'cf_'

/** Extra lead contact fields available across outreach / quote / form / report sends. */
export const LEAD_CONTACT_SEND_TAGS = [
  { key: 'email', tag: '{{email}}', label: 'Email' },
  { key: 'phone', tag: '{{phone}}', label: 'Phone' },
]

export function customFieldTagKey(fieldId) {
  return `${CUSTOM_FIELD_TAG_PREFIX}${String(fieldId || '').trim()}`
}

export function customFieldDefsToSendTags(defs = []) {
  return normalizeCustomFieldDefs(defs).map((def) => {
    const key = customFieldTagKey(def.id)
    return {
      key,
      label: def.label,
      tag: `{{${key}}}`,
    }
  })
}

export function buildCustomFieldTagData(lead, defs = []) {
  const out = {}
  for (const def of normalizeCustomFieldDefs(defs)) {
    const value = getCustomFieldValue(lead, def.id)
    out[customFieldTagKey(def.id)] = value == null ? '' : String(value)
  }
  return out
}

export function buildLeadContactTagData(lead) {
  if (!lead) return { email: '', phone: '' }
  return {
    email: getLeadEmails(lead)[0] || '',
    phone: getLeadPhones(lead)[0] || '',
  }
}

export function mergeSendTags(baseTags = [], ...extraLists) {
  const seen = new Set()
  const out = []
  for (const list of [baseTags, ...extraLists]) {
    for (const tag of list || []) {
      if (!tag?.key || seen.has(tag.key)) continue
      seen.add(tag.key)
      out.push(tag)
    }
  }
  return out
}

/** Built-in send tags + email/phone + team/solo custom lead fields. */
export function withLeadFieldTags(baseTags = [], customFieldDefs = []) {
  return mergeSendTags(
    baseTags,
    LEAD_CONTACT_SEND_TAGS,
    customFieldDefsToSendTags(customFieldDefs),
  )
}

/** Overlay lead contact + custom field values onto a built-in tag map for send-time resolve. */
export function withLeadFieldTagData(baseMap = {}, lead = null, customFieldDefs = []) {
  return {
    ...baseMap,
    ...buildLeadContactTagData(lead),
    ...buildCustomFieldTagData(lead, customFieldDefs),
  }
}

/** Keep cf_*, email, and phone values from raw data when replace builders rebuild a fixed map. */
export function passThroughLeadFieldValues(builtMap = {}, data = {}) {
  const out = { ...builtMap }
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'email' || key === 'phone' || key.startsWith(CUSTOM_FIELD_TAG_PREFIX)) {
      out[key] = value == null ? '' : String(value)
    }
  }
  return out
}
