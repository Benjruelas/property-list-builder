/**
 * Photo report CRUD client.
 */

import { getApiBase } from './apiBase'
import { buildReportPublicUrl as buildReportPublicUrlFromToken } from './publicLinks'

export async function fetchPhotoReports(getToken, { leadId, reportId } = {}) {
  const token = await getToken?.()
  if (!token) return []
  const params = new URLSearchParams()
  if (leadId) params.set('leadId', leadId)
  if (reportId) params.set('reportId', reportId)
  const qs = params.toString()
  const res = await fetch(`${getApiBase()}/photo-reports${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load reports')
  }
  const data = await res.json()
  if (reportId) return data.report
  return data.reports || []
}

export async function createPhotoReport(getToken, body) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/photo-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Create failed')
  }
  const data = await res.json()
  return data.report
}

export async function updatePhotoReport(getToken, reportId, updates) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/photo-reports`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reportId, ...updates }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Update failed')
  }
  const data = await res.json()
  return data.report
}

export async function deletePhotoReport(getToken, reportId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/photo-reports`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reportId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Delete failed')
  }
}

export async function generatePhotoReportPdf(getToken, reportId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/photo-reports-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reportId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'PDF generation failed')
  }
  return res.json()
}

export async function sendPhotoReportEmail(getToken, payload) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/photo-reports-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Send failed')
  }
  return res.json()
}

export function buildReportPublicUrl(token) {
  return buildReportPublicUrlFromToken(token)
}

export async function fetchPublicReport(token) {
  const res = await fetch(`${getApiBase()}/public-report?token=${encodeURIComponent(token)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Report not found')
  }
  return res.json()
}

export function reportPdfDownloadUrl(pdfKey, getToken) {
  return getToken().then((token) => {
    if (!token) throw new Error('Sign in required')
    return `${getApiBase()}/photo-reports?pdfKey=${encodeURIComponent(pdfKey)}`
  })
}

export function newReportSection(order = 0) {
  return {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    subtitle: '',
    description: '',
    photoIds: [],
    order,
  }
}

/** Default layout seed for first report template (mirrors DEFAULT_QUOTE_TEMPLATE pattern). */
export const DEFAULT_REPORT_TEMPLATE = {
  name: 'Roof Inspection Report',
  title: 'Property Photo Report',
  sections: [
    {
      ...newReportSection(0),
      subtitle: 'Overview',
      description: 'General property overview and context.',
    },
    {
      ...newReportSection(1),
      subtitle: 'Roof Condition',
      description: 'Photos documenting roof condition and any visible damage.',
    },
    {
      ...newReportSection(2),
      subtitle: 'Additional Notes',
      description: 'Supplemental photos and observations.',
    },
  ],
}

// --- Report layout templates ---

export async function fetchReportTemplates(getToken) {
  const token = await getToken?.()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/report-templates`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch report templates')
  }
  const data = await res.json()
  return data.templates || []
}

export async function createReportTemplate(getToken, payload) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/report-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create template')
  }
  const data = await res.json()
  return data.template
}

export async function updateReportTemplate(getToken, templateId, updates) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/report-templates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId, ...updates }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update template')
  }
  const data = await res.json()
  return data.template
}

export async function deleteReportTemplate(getToken, templateId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/report-templates`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete template')
  }
}

/** Clone template sections for a new report (fresh ids, empty photoIds). */
export function sectionsFromTemplate(template) {
  if (!template?.sections?.length) return [newReportSection(0)]
  return template.sections.map((s, i) => ({
    id: `sec_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
    subtitle: s.subtitle || '',
    description: s.description || '',
    photoIds: [],
    order: i,
  }))
}
