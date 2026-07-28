/**
 * Text message templates — server-backed via outreachTemplates.js.
 */

import { getCachedOutreachTemplates } from './outreachTemplates'

const STORAGE_KEY = 'text_templates'

try {
  localStorage.removeItem(STORAGE_KEY)
} catch {
  /* legacy local templates dropped — use /api/outreach-templates when signed in */
}

/**
 * Get all text templates (server cache when signed in; empty until fetched).
 * @returns {Array} Array of template objects
 */
export const getTextTemplates = () => getCachedOutreachTemplates('text')

/**
 * Save templates array to localStorage
 * @param {Array} templates - Array of template objects
 */
const saveTextTemplates = (templates) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Error saving text templates:', error)
  }
}

/**
 * Add a new text template
 * @param {Object} template - Template object with { name, body }
 * @returns {string} Template ID
 */
export const addTextTemplate = (template) => {
  const templates = getTextTemplates()
  const templateId = `text_template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  const newTemplate = {
    id: templateId,
    name: template.name || 'Untitled Template',
    body: template.body || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  templates.push(newTemplate)
  saveTextTemplates(templates)
  return templateId
}

/**
 * Update an existing text template
 * @param {string} templateId - Template ID
 * @param {Object} updates - Updates to apply { name, body }
 */
export const updateTextTemplate = (templateId, updates) => {
  const templates = getTextTemplates()
  const index = templates.findIndex((t) => t.id === templateId)

  if (index === -1) {
    console.warn('Text template not found:', templateId)
    return false
  }

  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }

  saveTextTemplates(templates)
  return true
}

/**
 * Delete a text template
 * @param {string} templateId - Template ID
 */
export const deleteTextTemplate = (templateId) => {
  const templates = getTextTemplates()
  const filtered = templates.filter((t) => t.id !== templateId)
  saveTextTemplates(filtered)
}

export const OUTREACH_TEXT_SHARE_TYPE = 'knockscout-outreach-text-v1'

/** @returns {string} JSON to copy/share so teammates can import in Outreach */
export const serializeTextTemplateForShare = (t) =>
  JSON.stringify(
    {
      type: OUTREACH_TEXT_SHARE_TYPE,
      name: t.name || 'Untitled',
      body: t.body ?? '',
    },
    null,
    2
  )

/**
 * @param {string} jsonString
 * @returns {string} new template id
 */
export const importTextTemplateFromShareJson = (jsonString) => {
  const data = JSON.parse((jsonString || '').trim())
  if (data.type !== OUTREACH_TEXT_SHARE_TYPE) {
    throw new Error('This is not a valid shared text template')
  }
  return addTextTemplate({
    name: data.name,
    body: data.body,
  })
}
