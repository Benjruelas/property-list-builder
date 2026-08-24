/**
 * User-scoped form templates API. Mirrors src/utils/lists.js.
 * All methods accept an async getToken() that returns a Firebase ID token.
 */

import { fetchAuthenticatedBlob } from './filePreview'

import { getApiBase } from './apiBase'

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

export async function shareTemplateWithTeams(getToken, templateId, sharePatch, teamId = null) {
  return updateTemplate(getToken, templateId, {
    visibility: sharePatch.visibility,
    sharedMemberUids: sharePatch.sharedMemberUids || [],
    teamId: sharePatch.visibility === 'team' ? teamId : null,
    teamShares: sharePatch.visibility === 'team' && teamId ? [teamId] : [],
  })
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

export function formPdfUrl(key) {
  if (!key) return ''
  return `${getApiBase()}/forms-upload?key=${encodeURIComponent(key)}`
}

export async function fetchFormPdfBlob(getToken, key) {
  return fetchAuthenticatedBlob(getToken, formPdfUrl(key))
}

export async function downloadFormPdf(getToken, key) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to fetch PDFs')
  if (!key) throw new Error('key is required')
  const url = formPdfUrl(key)
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
  return parseJsonSafe(res)
}

export async function createFormInvite(getToken, {
  templateId,
  recipientEmail,
  recipientPhone,
  subject,
  message,
  prefillValues,
  leadId,
  leadName,
  skipEmail,
  senderUid,
}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to send form links')
  const res = await fetch(`${getApiBase()}/forms-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      templateId,
      recipientEmail,
      recipientPhone,
      subject,
      message,
      prefillValues,
      leadId,
      leadName,
      skipEmail,
      senderUid,
    }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to send form link')
  }
  return parseJsonSafe(res)
}

export async function fetchPublicForm(formToken) {
  const token = String(formToken || '').trim()
  if (!token) throw new Error('Form link is missing')
  const res = await fetch(`${getApiBase()}/public-form?token=${encodeURIComponent(token)}`)
  const data = await parseJsonSafe(res)
  if (!res.ok) throw new Error(data.error || 'Failed to load form')
  return data
}

export async function downloadPublicFormPdf(formToken) {
  const token = String(formToken || '').trim()
  if (!token) throw new Error('Form link is missing')
  const res = await fetch(`${getApiBase()}/public-form?token=${encodeURIComponent(token)}&pdf=1`)
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to download PDF')
  }
  return await res.arrayBuffer()
}

export async function submitPublicForm(formToken, { pdfBase64, values, consent, submitterEmail }) {
  const token = String(formToken || '').trim()
  if (!token) throw new Error('Form link is missing')
  const res = await fetch(`${getApiBase()}/public-form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pdfBase64, values, consent, submitterEmail }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to submit form')
  }
  return parseJsonSafe(res)
}

export async function fetchFormSubmission(getToken, { submissionId, inviteId } = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to view submissions')
  const params = new URLSearchParams()
  if (submissionId) params.set('submissionId', String(submissionId))
  else if (inviteId) params.set('inviteId', String(inviteId))
  else throw new Error('submissionId or inviteId is required')
  const res = await fetch(`${getApiBase()}/forms-submissions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to load submission')
  }
  const data = await parseJsonSafe(res)
  return data.submission || null
}

export async function fetchFormSubmissions(getToken, templateId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to view submissions')
  const res = await fetch(
    `${getApiBase()}/forms-submissions?templateId=${encodeURIComponent(templateId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to load submissions')
  }
  return parseJsonSafe(res)
}

export async function fetchFormSubmissionPdfBlob(getToken, pdfKey) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to view completed form')
  return fetchAuthenticatedBlob(
    getToken,
    `${getApiBase()}/forms-submissions?pdfKey=${encodeURIComponent(pdfKey)}`,
  )
}

export async function deleteFormSubmission(getToken, { submissionId, pdfKey } = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete completed form')
  const params = new URLSearchParams()
  // Always send pdfKey when present — lead activity rows may use invite id as `id`.
  if (pdfKey) params.set('pdfKey', pdfKey)
  if (submissionId) params.set('submissionId', submissionId)
  if (![...params.keys()].length) throw new Error('submissionId or pdfKey is required')
  const res = await fetch(`${getApiBase()}/forms-submissions?${params}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete completed form')
  }
  return parseJsonSafe(res)
}
