/**
 * Shared {{tag}} substitution for outbound message templates (quotes, reports, forms).
 */

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

/** @param {Record<string, string | number | null | undefined>} data PascalCase keys accepted for report send payloads. */
export function replaceReportSendTags(template, data = {}) {
  const map = {
    clientName: data.clientName ?? data.ClientName ?? 'there',
    reportTitle: data.reportTitle ?? data.ReportTitle ?? 'your report',
    reportLink: data.reportLink ?? data.ReportLink ?? '',
    senderName: data.senderName ?? data.SenderName ?? data.senderEmail?.split('@')[0] ?? 'Your rep',
    companyName: data.companyName ?? data.CompanyName ?? 'KnockScout',
    leadAddress: data.leadAddress ?? data.LeadAddress ?? '',
  }
  return replaceMustacheTags(template, map)
}

export const REPORT_SEND_TAGS = [
  { tag: '{{clientName}}', label: 'Client name' },
  { tag: '{{reportTitle}}', label: 'Report title' },
  { tag: '{{reportLink}}', label: 'Report link' },
  { tag: '{{senderName}}', label: 'Your name' },
  { tag: '{{companyName}}', label: 'Company name' },
  { tag: '{{leadAddress}}', label: 'Lead address' },
]
