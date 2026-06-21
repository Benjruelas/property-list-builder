/**
 * Stateless signed preview links — no invite row or previewToken persistence required.
 */

import crypto from 'node:crypto'

function previewSecret() {
  return (
    process.env.PREVIEW_LINK_SECRET
    || process.env.FIREBASE_API_KEY
    || process.env.VITE_FIREBASE_API_KEY
    || 'dev-preview-link-secret'
  )
}

function signPreview(entityType, entityId) {
  return crypto
    .createHmac('sha256', previewSecret())
    .update(`${entityType}:${entityId}`)
    .digest('hex')
    .slice(0, 32)
}

export function mintQuotePreviewToken(quoteId) {
  const id = String(quoteId || '').trim()
  if (!id) throw new Error('quoteId is required')
  return `${id}.${signPreview('quote', id)}`
}

export function mintReportPreviewToken(reportId) {
  const id = String(reportId || '').trim()
  if (!id) throw new Error('reportId is required')
  return `${id}.${signPreview('report', id)}`
}

export function parseQuotePreviewToken(token) {
  const normalized = String(token || '').trim()
  const dot = normalized.lastIndexOf('.')
  if (dot <= 0) return null
  const quoteId = normalized.slice(0, dot)
  const sig = normalized.slice(dot + 1)
  if (!quoteId.startsWith('quote_') || sig.length < 16) return null
  if (sig !== signPreview('quote', quoteId)) return null
  return quoteId
}

export function parseReportPreviewToken(token) {
  const normalized = String(token || '').trim()
  const dot = normalized.lastIndexOf('.')
  if (dot <= 0) return null
  const reportId = normalized.slice(0, dot)
  const sig = normalized.slice(dot + 1)
  if (!reportId.startsWith('preport_') && !reportId.startsWith('report_')) return null
  if (sig !== signPreview('report', reportId)) return null
  return reportId
}
