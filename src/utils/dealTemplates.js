/**
 * Deal templates — reusable defaults for Create Deal (notes, finances, tasks).
 * Server-backed via /api/deal-templates (legacy localStorage cleared on load).
 */

import { getApiBase } from './apiBase'
import { normalizeDealLineItems } from './dealFinances'
import { normalizePendingDealTask } from './dealTasks'

const LEGACY_STORAGE_KEY = 'deal_templates'

try {
  localStorage.removeItem(LEGACY_STORAGE_KEY)
} catch {
  /* ignore */
}

let templateCache = []

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function authFetch(getToken, path, options = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  return fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
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

export function getDealTemplates() {
  return templateCache
}

export function setDealTemplatesCache(templates) {
  templateCache = Array.isArray(templates) ? templates : []
}

export async function fetchDealTemplates(getToken) {
  const res = await authFetch(getToken, '/deal-templates')
  if (!res.ok) throw new Error('Failed to fetch deal templates')
  const data = await parseJsonSafe(res)
  const templates = data.templates || []
  setDealTemplatesCache(templates)
  return templates
}

export async function createDealTemplate(getToken, template) {
  const payload = normalizeTemplatePayload(template)
  const res = await authFetch(getToken, '/deal-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to create template')
  }
  const data = await parseJsonSafe(res)
  const created = data.template
  setDealTemplatesCache([...templateCache, created])
  return created
}

export async function updateDealTemplateApi(getToken, templateId, updates) {
  const merged = { ...getDealTemplateById(templateId), ...updates }
  const payload = { templateId, ...normalizeTemplatePayload(merged) }
  const res = await authFetch(getToken, '/deal-templates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to update template')
  }
  const data = await parseJsonSafe(res)
  const updated = data.template
  setDealTemplatesCache(templateCache.map((t) => (t.id === templateId ? updated : t)))
  return updated
}

export async function deleteDealTemplateApi(getToken, templateId) {
  const res = await authFetch(getToken, '/deal-templates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete template')
  }
  setDealTemplatesCache(templateCache.filter((t) => t.id !== templateId))
}

/** @deprecated use createDealTemplate / updateDealTemplateApi */
export function addDealTemplate(template) {
  console.warn('addDealTemplate is deprecated; sign in and use createDealTemplate')
  const id = `deal_tpl_local_${Date.now()}`
  const now = new Date().toISOString()
  const normalized = normalizeTemplatePayload(template)
  const newTemplate = { id, ...normalized, createdAt: now, updatedAt: now }
  setDealTemplatesCache([...templateCache, newTemplate])
  return id
}

/** @deprecated use updateDealTemplateApi */
export function updateDealTemplate(templateId, updates) {
  const index = templateCache.findIndex((t) => t.id === templateId)
  if (index === -1) return false
  const merged = { ...templateCache[index], ...updates }
  const normalized = normalizeTemplatePayload(merged)
  templateCache[index] = {
    ...templateCache[index],
    ...normalized,
    updatedAt: new Date().toISOString(),
  }
  return true
}

/** @deprecated use deleteDealTemplateApi */
export function deleteDealTemplate(templateId) {
  setDealTemplatesCache(templateCache.filter((t) => t.id !== templateId))
}

export function getDealTemplateById(templateId) {
  return templateCache.find((t) => t.id === templateId) || null
}

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
