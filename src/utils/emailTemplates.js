/**
 * Utility functions for managing email templates (parcel tag merge + legacy helpers).
 * Saved outreach templates live on the server — see outreachTemplates.js.
 */

import { splitOwnerName, composeFullName } from './ownerName'
import { getCachedOutreachTemplates } from './outreachTemplates'

const STORAGE_KEY = 'email_templates'

try {
  localStorage.removeItem(STORAGE_KEY)
} catch {
  /* legacy local templates dropped — use /api/outreach-templates when signed in */
}

/**
 * Get all email templates (server cache when signed in; empty until fetched).
 * @returns {Array} Array of template objects
 */
export const getEmailTemplates = () => getCachedOutreachTemplates('email')

/**
 * Save templates array to localStorage
 * @param {Array} templates - Array of template objects
 */
const saveEmailTemplates = (templates) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Error saving email templates:', error)
  }
}

/**
 * Add a new email template
 * @param {Object} template - Template object with { name, subject, body }
 * @returns {string} Template ID
 */
export const addEmailTemplate = (template) => {
  const templates = getEmailTemplates()
  const templateId = `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  const newTemplate = {
    id: templateId,
    name: template.name || 'Untitled Template',
    subject: template.subject || '',
    body: template.body || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  templates.push(newTemplate)
  saveEmailTemplates(templates)
  return templateId
}

/**
 * Update an existing email template
 * @param {string} templateId - Template ID
 * @param {Object} updates - Updates to apply { name, subject, body }
 */
export const updateEmailTemplate = (templateId, updates) => {
  const templates = getEmailTemplates()
  const index = templates.findIndex(t => t.id === templateId)
  
  if (index === -1) {
    console.warn('Template not found:', templateId)
    return false
  }
  
  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  saveEmailTemplates(templates)
  return true
}

/**
 * Delete an email template
 * @param {string} templateId - Template ID
 */
export const deleteEmailTemplate = (templateId) => {
  const templates = getEmailTemplates()
  const filtered = templates.filter(t => t.id !== templateId)
  saveEmailTemplates(filtered)
}

export const OUTREACH_EMAIL_SHARE_TYPE = 'knockscout-outreach-email-v1'

/** @returns {string} JSON to copy/share so teammates can import in Outreach */
export const serializeEmailTemplateForShare = (t) =>
  JSON.stringify(
    {
      type: OUTREACH_EMAIL_SHARE_TYPE,
      name: t.name || 'Untitled',
      subject: t.subject ?? '',
      body: t.body ?? '',
    },
    null,
    2
  )

/**
 * @param {string} jsonString
 * @returns {string} new template id
 */
export const importEmailTemplateFromShareJson = (jsonString) => {
  const data = JSON.parse((jsonString || '').trim())
  if (data.type !== OUTREACH_EMAIL_SHARE_TYPE) {
    throw new Error('This is not a valid shared email template')
  }
  return addEmailTemplate({
    name: data.name,
    subject: data.subject,
    body: data.body,
  })
}

/**
 * Replace template tags with actual values from parcel data
 * @param {string} text - Text with tags like {Owner Name}, {Address}, {City}
 * @param {Object} parcelData - Parcel data object
 * @returns {string} Text with tags replaced
 */
export const replaceTemplateTags = (text, parcelData) => {
  if (!text || !parcelData) return text || ''

  const properties = parcelData.properties || {}
  const lead = parcelData.lead || null

  // First/last priority: explicit fields on parcelData, then embedded lead,
  // then parsed from the raw OWNER_NAME string.
  const ownerRaw = properties.OWNER_NAME || parcelData.ownerName || lead?.owner || ''
  const parsed = (ownerRaw || '') ? splitOwnerName(ownerRaw) : { firstName: '', lastName: '' }
  const firstName = (parcelData.firstName || lead?.firstName || parsed.firstName || '').toString().trim()
  const lastName = (parcelData.lastName || lead?.lastName || parsed.lastName || '').toString().trim()
  const fullName = composeFullName(firstName, lastName) || ownerRaw || ''

  const tagMap = {
    'Owner Name': ownerRaw || fullName,
    'First Name': firstName,
    'Last Name': lastName,
    'Full Name': fullName,
    'FirstName': firstName,
    'LastName': lastName,
    'FullName': fullName,
    'Address': parcelData.address || properties.SITUS_ADDR || properties.SITE_ADDR || '',
    'City': properties.scity || properties.PROP_CITY || properties.SITUS_CITY || properties.CITY || '',
    'State': properties.state2 || properties.PROP_STATE || properties.SITUS_STATE || properties.STATE || 'TX',
    'Zip': (properties.szip || properties.szip5 || properties.PROP_ZIP || properties.SITUS_ZIP || properties.ZIP || properties.ZIP_CODE || '').toString().trim() || '',
    'Property ID': parcelData.id || properties.PROP_ID || '',
    'Year Built': properties.YEAR_BUILT || '',
    'Property Value': properties.TOTAL_VALUE || properties.ASSESSED_VALUE || ''
  }

  let result = text

  // Replace longer tag names first so "First Name" wins over accidental
  // overlap with a shorter tag if any were ever added.
  const sortedTags = Object.keys(tagMap).sort((a, b) => b.length - a.length)
  sortedTags.forEach(tag => {
    const regex = new RegExp(`\\{${tag.replace(/ /g, '\\s*')}\\}`, 'gi')
    result = result.replace(regex, tagMap[tag] || '')
  })

  return result
}

/**
 * Available template tags for insertion
 */
export const AVAILABLE_TAGS = [
  'First Name',
  'Last Name',
  'Full Name',
  'Owner Name',
  'Address',
  'City',
  'State',
  'Zip'
]

/** Mustache keys used by MessageTagEditor; storage remains `{Label}` brace tags. */
const OUTREACH_TAG_DEFS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'ownerName', label: 'Owner Name' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
]

export const OUTREACH_SEND_TAGS = OUTREACH_TAG_DEFS.map(({ key, label }) => ({
  key,
  label,
  tag: `{{${key}}}`,
}))

const LABEL_TO_KEY = Object.fromEntries(OUTREACH_TAG_DEFS.map((t) => [t.label.toLowerCase(), t.key]))
const KEY_TO_LABEL = Object.fromEntries(OUTREACH_TAG_DEFS.map((t) => [t.key, t.label]))

/** Legacy brace aliases without spaces → camelCase keys. */
const LEGACY_BRACE_TO_KEY = {
  firstname: 'firstName',
  lastname: 'lastName',
  fullname: 'fullName',
  ownername: 'ownerName',
  propertyid: 'propertyId',
  yearbuilt: 'yearBuilt',
  propertyvalue: 'propertyValue',
}

/** Convert stored `{First Name}` templates → `{{firstName}}` for the tag editor. */
export function braceTagsToMustache(text) {
  if (!text) return ''
  return String(text).replace(/\{([^{}]+)\}/g, (match, raw) => {
    const normalized = String(raw).replace(/\s+/g, ' ').trim()
    const key =
      LABEL_TO_KEY[normalized.toLowerCase()]
      || LEGACY_BRACE_TO_KEY[normalized.replace(/\s+/g, '').toLowerCase()]
    return key ? `{{${key}}}` : match
  })
}

/** Convert editor `{{firstName}}` → `{First Name}` for storage/API consistency. */
export function mustacheToBraceTags(text) {
  if (!text) return ''
  return String(text).replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const label = KEY_TO_LABEL[key]
    return label ? `{${label}}` : match
  })
}

/** Resolved camelCase values for outreach tag pills / send-time substitution. */
export function buildOutreachTagData(parcelData) {
  if (!parcelData) {
    return {
      firstName: '',
      lastName: '',
      fullName: '',
      ownerName: '',
      address: '',
      city: '',
      state: '',
      zip: '',
    }
  }
  const properties = parcelData.properties || {}
  const lead = parcelData.lead || null
  const ownerRaw = properties.OWNER_NAME || parcelData.ownerName || lead?.owner || ''
  const parsed = ownerRaw ? splitOwnerName(ownerRaw) : { firstName: '', lastName: '' }
  const firstName = (parcelData.firstName || lead?.firstName || parsed.firstName || '').toString().trim()
  const lastName = (parcelData.lastName || lead?.lastName || parsed.lastName || '').toString().trim()
  const fullName = composeFullName(firstName, lastName) || ownerRaw || ''
  return {
    firstName,
    lastName,
    fullName,
    ownerName: ownerRaw || fullName,
    address: parcelData.address || properties.SITUS_ADDR || properties.SITE_ADDR || '',
    city: properties.scity || properties.PROP_CITY || properties.SITUS_CITY || properties.CITY || '',
    state: properties.state2 || properties.PROP_STATE || properties.SITUS_STATE || properties.STATE || 'TX',
    zip: (properties.szip || properties.szip5 || properties.PROP_ZIP || properties.SITUS_ZIP || properties.ZIP || properties.ZIP_CODE || '').toString().trim() || '',
  }
}

/** Resolve mustache (or brace) outreach template text against parcel data. */
export function resolveOutreachTemplateText(text, parcelData) {
  if (!text) return ''
  const withBraces = mustacheToBraceTags(String(text))
  return replaceTemplateTags(withBraces, parcelData)
}
