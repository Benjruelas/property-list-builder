/**
 * Deal templates — reusable defaults for Create Deal (notes, finances, tasks).
 * Stored in localStorage; synced via userDataSync when signed in.
 */

import { normalizeDealLineItems } from './dealFinances'
import { normalizePendingDealTask } from './dealTasks'

const STORAGE_KEY = 'deal_templates'

export function getDealTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error getting deal templates:', error)
    return []
  }
}

function saveDealTemplates(templates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Error saving deal templates:', error)
  }
}

function normalizeTemplatePayload(template) {
  return {
    name: (template?.name ?? '').toString().trim() || 'Untitled template',
    title: (template?.title ?? '').toString(),
    notes: (template?.notes ?? '').toString(),
    pipelineId: template?.pipelineId || null,
    payments: normalizeDealLineItems(template?.payments),
    costs: normalizeDealLineItems(template?.costs),
    tasks: Array.isArray(template?.tasks)
      ? template.tasks.map((t) => normalizePendingDealTask(t))
      : [],
  }
}

export function addDealTemplate(template) {
  const templates = getDealTemplates()
  const id = `deal_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const now = new Date().toISOString()
  const normalized = normalizeTemplatePayload(template)
  const newTemplate = {
    id,
    ...normalized,
    createdAt: now,
    updatedAt: now,
  }
  templates.push(newTemplate)
  saveDealTemplates(templates)
  return id
}

export function updateDealTemplate(templateId, updates) {
  const templates = getDealTemplates()
  const index = templates.findIndex((t) => t.id === templateId)
  if (index === -1) {
    console.warn('Deal template not found:', templateId)
    return false
  }
  const merged = { ...templates[index], ...updates }
  const normalized = normalizeTemplatePayload(merged)
  templates[index] = {
    ...templates[index],
    ...normalized,
    updatedAt: new Date().toISOString(),
  }
  saveDealTemplates(templates)
  return true
}

export function deleteDealTemplate(templateId) {
  const templates = getDealTemplates().filter((t) => t.id !== templateId)
  saveDealTemplates(templates)
}

export function getDealTemplateById(templateId) {
  return getDealTemplates().find((t) => t.id === templateId) || null
}

/**
 * Map a saved template to CreateDealDialog prefill fields.
 * Caller prefill wins for leadId and pipelineId.
 */
export function templateToCreateDealPrefill(template, callerPrefill = {}) {
  if (!template) return { ...callerPrefill }
  const fromTemplate = {
    title: template.title || '',
    notes: template.notes || '',
    payments: template.payments || [],
    costs: template.costs || [],
    tasks: template.tasks || [],
  }
  if (template.pipelineId && !callerPrefill.pipelineId) {
    fromTemplate.pipelineId = template.pipelineId
  }
  return {
    ...fromTemplate,
    ...callerPrefill,
    title: callerPrefill.title ?? fromTemplate.title,
    notes: callerPrefill.notes ?? fromTemplate.notes,
    payments: callerPrefill.payments ?? fromTemplate.payments,
    costs: callerPrefill.costs ?? fromTemplate.costs,
    tasks: callerPrefill.tasks ?? fromTemplate.tasks,
  }
}

export function dealTemplateSummary(template) {
  const parts = []
  if (template.title?.trim()) parts.push('default title')
  if (template.notes?.trim()) parts.push('notes')
  const pay = template.payments?.length || 0
  const cost = template.costs?.length || 0
  if (pay || cost) parts.push(`${pay + cost} line item${pay + cost !== 1 ? 's' : ''}`)
  const tasks = template.tasks?.length || 0
  if (tasks) parts.push(`${tasks} task${tasks !== 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : 'Empty template'
}
