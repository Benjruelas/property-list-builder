/**
 * Utility functions for managing email templates
 * Templates are stored in localStorage
 */

import { splitOwnerName, composeFullName } from './ownerName'

const STORAGE_KEY = 'email_templates'

/**
 * Get all email templates
 * @returns {Array} Array of template objects
 */
export const getEmailTemplates = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error getting email templates:', error)
    return []
  }
}

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
