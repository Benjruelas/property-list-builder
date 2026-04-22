/**
 * User-scoped form templates API. Mirrors src/utils/lists.js.
 * All methods accept an async getToken() that returns a Firebase ID token.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function fetchTemplates(getToken) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/forms`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch form templates')
  const data = await parseJsonSafe(res)
  return data.templates || []
}

export async function createTemplate(getToken, { name, fields = [], originalPdfKey = null, originalPdfUrl = null, pageCount = 0 }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to create templates')
  const res = await fetch(`${getApiBase()}/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, fields, originalPdfKey, originalPdfUrl, pageCount })
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to create template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function updateTemplate(getToken, templateId, updates = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to update templates')
  if (!templateId) throw new Error('templateId is required')
  const body = { templateId: String(templateId), ...updates }
  const res = await fetch(`${getApiBase()}/forms`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to update template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function shareTemplate(getToken, templateId, sharedWith) {
  return updateTemplate(getToken, templateId, { sharedWith })
}

export async function shareTemplateWithTeams(getToken, templateId, teamShares) {
  return updateTemplate(getToken, templateId, { teamShares })
}

export async function deleteTemplate(getToken, templateId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete templates')
  if (!templateId) throw new Error('templateId is required')
  const res = await fetch(`${getApiBase()}/forms`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId: String(templateId) })
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete template')
  }
}

/**
 * Convert an ArrayBuffer/Uint8Array to a base64 string without blowing the call stack.
 * Chunked to avoid "Maximum call stack size exceeded" on large PDFs.
 */
export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk))
  }
  if (typeof btoa !== 'undefined') return btoa(binary)
  return Buffer.from(binary, 'binary').toString('base64')
}

export async function uploadFormPdf(getToken, { templateId, file }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to upload PDFs')
  if (!templateId) throw new Error('templateId is required')
  if (!file) throw new Error('file is required')
  const buf = file instanceof ArrayBuffer ? new Uint8Array(file) : new Uint8Array(await file.arrayBuffer())
  const pdfBase64 = bytesToBase64(buf)
  const res = await fetch(`${getApiBase()}/forms-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId, pdfBase64 })
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to upload PDF')
  }
  return await parseJsonSafe(res)
}

export async function downloadFormPdf(getToken, key) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to fetch PDFs')
  if (!key) throw new Error('key is required')
  const url = `${getApiBase()}/forms-upload?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to download PDF')
  }
  return await res.arrayBuffer()
}

export async function sendForm(getToken, payload) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to send forms')
  const res = await fetch(`${getApiBase()}/forms-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to send form')
  }
  return await parseJsonSafe(res)
}
