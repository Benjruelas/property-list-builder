import { buildQuoteDocumentHtml } from './publicDocumentHtml.js'
import { htmlToPdfBuffer } from './htmlToPdf.js'

/**
 * Build a quote PDF that matches the public `/q/{token}` HTML page.
 * @param {{ quote: object, invite: object, branding: object }} opts
 */
export async function buildQuotePdfBuffer({ quote, invite, branding }) {
  const html = buildQuoteDocumentHtml({ quote, invite, branding })
  return htmlToPdfBuffer(html, { waitUntil: 'domcontentloaded' })
}

export function safeQuotePdfFilename(title) {
  const base = String(title || 'quote').replace(/[^\w\s-]/g, '').trim() || 'quote'
  return `${base.slice(0, 80)}.pdf`
}
