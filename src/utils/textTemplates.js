/**
 * Utility functions for managing text message templates
 * Templates are stored in localStorage (name + body only, no subject)
 */

const STORAGE_KEY = 'text_templates'

/**
 * Get all text templates
 * @returns {Array} Array of template objects
 */
export const getTextTemplates = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error getting text templates:', error)
    return []
  }
}

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
