/**
 * Shared {{tag}} substitution for outbound message templates (quotes, reports, forms).
 */

import { passThroughLeadFieldValues } from './leadSendTags'

/** @param {string} text @param {Record<string, string | number | null | undefined>} map */
export function replaceMustacheTags(text, map = {}) {
  if (!text) return ''
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = map[key]
    return v == null ? '' : String(v)
  })
}

/** Legacy report tags {PascalCase} → {{camelCase}} for known keys only. */
const LEGACY_REPORT_TAG_PAIRS = [
  ['ClientName', 'clientName'],
  ['ReportTitle', 'reportTitle'],
  ['ReportLink', 'reportLink'],
  ['SenderName', 'senderName'],
  ['CompanyName', 'companyName'],
  ['LeadAddress', 'leadAddress'],
]

export function migrateLegacyReportTemplateText(text) {
  if (!text) return ''
  let out = String(text)
  for (const [legacy, modern] of LEGACY_REPORT_TAG_PAIRS) {
    out = out.split(`{${legacy}}`).join(`{{${modern}}}`)
  }
  return out
}

export const REPORT_SEND_TAGS = [
  { key: 'firstName', tag: '{{firstName}}', label: 'First Name' },
  { key: 'lastName', tag: '{{lastName}}', label: 'Last Name' },
  { key: 'reportTitle', tag: '{{reportTitle}}', label: 'Title' },
  { key: 'reportLink', tag: '{{reportLink}}', label: 'Report Link' },
  { key: 'senderName', tag: '{{senderName}}', label: 'Your Name' },
  { key: 'companyName', tag: '{{companyName}}', label: 'Company Name' },
  { key: 'leadAddress', tag: '{{leadAddress}}', label: 'Lead Address' },
]

export const FORM_SEND_TAGS = [
  { key: 'firstName', tag: '{{firstName}}', label: 'First Name' },
  { key: 'lastName', tag: '{{lastName}}', label: 'Last Name' },
  { key: 'formName', tag: '{{formName}}', label: 'Form Name' },
  { key: 'formLink', tag: '{{formLink}}', label: 'Form Link' },
  { key: 'senderName', tag: '{{senderName}}', label: 'Your Name' },
  { key: 'companyName', tag: '{{companyName}}', label: 'Company Name' },
]

const EMPTY_PILL_PLACEHOLDERS = new Set([
  '',
  '[link will appear after send]',
  '{ReportLink}',
  '{{reportLink}}',
  '{{formLink}}',
  '{{quoteLink}}',
])

function labelsFromTags(tags = []) {
  return Object.fromEntries(tags.map((t) => [t.key, t.label]))
}

/** Pill label: resolved value when present, otherwise attribute name. */
export function getTagPillText(key, data = {}, tags = []) {
  const labels = labelsFromTags(tags)
  const label = labels[key] || key
  const raw = data[key] ?? data[key.charAt(0).toUpperCase() + key.slice(1)] ?? ''
  const text = String(raw).trim()
  if (EMPTY_PILL_PLACEHOLDERS.has(text)) return label
  return text
}

export function isPillTagKey(key, tags = []) {
  return tags.some((t) => t.key === key)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Convert mustache template text → contentEditable HTML with pills. */
export function mustacheToTagEditorHtml(text, data = {}, tags = [], getPillTextFn) {
  const raw = String(text || '')
  if (!raw) return ''
  const tagsWithLegacy = [...tags, { key: 'clientName', label: 'Client Name' }]
  const resolvePill = (key) => (
    typeof getPillTextFn === 'function'
      ? getPillTextFn(key, data)
      : getTagPillText(key, data, tagsWithLegacy)
  )
  const re = /\{\{(\w+)\}\}/g
  let html = ''
  let lastIndex = 0
  let m
  while ((m = re.exec(raw)) !== null) {
    html += escapeHtml(raw.slice(lastIndex, m.index)).replace(/\n/g, '<br>')
    const key = m[1]
    if (isPillTagKey(key, tags) || key === 'clientName') {
      const display = escapeHtml(resolvePill(key))
      html += `<span class="quote-msg-tag-pill" contenteditable="false" data-tag="${key}">${display}</span>`
    } else {
      html += escapeHtml(m[0])
    }
    lastIndex = m.index + m[0].length
  }
  html += escapeHtml(raw.slice(lastIndex)).replace(/\n/g, '<br>')
  return html
}

/** Serialize contentEditable root back to mustache template text. */
export function tagEditorDomToMustache(root, tags = []) {
  if (!root) return ''

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || ''
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node
    const key = el.dataset?.tag
    if (key && (isPillTagKey(key, tags) || key === 'clientName')) {
      return `{{${key}}}`
    }
    if (el.tagName === 'BR') return '\n'
    let out = ''
    for (const child of el.childNodes) {
      out += walk(child)
    }
    if ((el.tagName === 'DIV' || el.tagName === 'P') && el !== root && el.nextSibling) {
      if (!out.endsWith('\n')) out += '\n'
    }
    return out
  }

  let result = ''
  for (const child of root.childNodes) {
    result += walk(child)
  }
  return result.replace(/\u00a0/g, ' ')
}

/** @param {Record<string, string | number | null | undefined>} data PascalCase keys accepted for report send payloads. */
export function replaceReportSendTags(template, data = {}) {
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const clientName = String(data.clientName ?? data.ClientName ?? '').trim()
    || [firstName, lastName].filter(Boolean).join(' ')
    || 'there'
  const map = {
    firstName: firstName || (clientName !== 'there' ? clientName.split(/\s+/)[0] : '') || 'there',
    lastName,
    clientName,
    reportTitle: data.reportTitle ?? data.ReportTitle ?? 'your report',
    reportLink: data.reportLink ?? data.ReportLink ?? '',
    senderName: data.senderName ?? data.SenderName ?? data.senderEmail?.split('@')[0] ?? 'Your rep',
    companyName: data.companyName ?? data.CompanyName ?? 'KnockScout',
    leadAddress: data.leadAddress ?? data.LeadAddress ?? '',
  }
  return replaceMustacheTags(template, passThroughLeadFieldValues(map, data))
}

export function replaceFormSendTags(template, data = {}) {
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const clientName = String(data.clientName || '').trim()
    || [firstName, lastName].filter(Boolean).join(' ')
    || 'there'
  return replaceMustacheTags(template, passThroughLeadFieldValues({
    firstName: firstName || (clientName !== 'there' ? clientName.split(/\s+/)[0] : '') || 'there',
    lastName,
    clientName,
    formName: data.formName || 'Form',
    formLink: data.formLink || '',
    senderName: data.senderName || data.senderEmail?.split('@')[0] || 'Your rep',
    companyName: data.companyName || 'KnockScout',
  }, data))
}
