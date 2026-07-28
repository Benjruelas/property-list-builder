/**
 * Outreach templates (email + text) — server-backed via /api/outreach-templates.
 */

import { getApiBase } from './apiBase'

const LEGACY_EMAIL = 'email_templates'
const LEGACY_TEXT = 'text_templates'

try {
  localStorage.removeItem(LEGACY_EMAIL)
  localStorage.removeItem(LEGACY_TEXT)
} catch {
  /* ignore */
}

const cache = { email: [], text: [] }

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

export function getCachedOutreachTemplates(channel) {
  return cache[channel === 'text' ? 'text' : 'email'] || []
}

export function setCachedOutreachTemplates(channel, templates) {
  const key = channel === 'text' ? 'text' : 'email'
  cache[key] = Array.isArray(templates) ? templates : []
}

export async function fetchOutreachTemplates(getToken, channel) {
  const ch = channel === 'text' ? 'text' : 'email'
  const res = await authFetch(getToken, `/outreach-templates?channel=${ch}`)
  if (!res.ok) throw new Error('Failed to fetch templates')
  const data = await parseJsonSafe(res)
  const templates = data.templates || []
  setCachedOutreachTemplates(ch, templates)
  return templates
}

export async function createOutreachTemplate(getToken, { channel, name, subject = '', body = '' }) {
  const res = await authFetch(getToken, '/outreach-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, name, subject, body }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to create template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function updateOutreachTemplateApi(getToken, templateId, updates) {
  const res = await authFetch(getToken, '/outreach-templates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, ...updates }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to update template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function deleteOutreachTemplateApi(getToken, templateId) {
  const res = await authFetch(getToken, '/outreach-templates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete template')
  }
}

export function serializeOutreachTemplateForShare(template) {
  return JSON.stringify(template, null, 2)
}
