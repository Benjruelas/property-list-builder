/**
 * Printable HTML for public quote/report pages.
 * Intentionally mirrors PublicQuotePage / PublicReportPage layout + chrome
 * so PDF output matches the link view.
 *
 * Page size matches the public content column (not Letter-with-side-gutters),
 * so PDFs read as a continuous scroll of the link page rather than screenshots
 * pasted onto letter paper.
 */

import { escapeHtml } from './senderBranding.js'
import {
  computeQuoteTotals,
  resolveAcceptedLineIds,
} from './quoteMath.js'

/** Public quote column: max-w-lg (32rem) + px-4 gutters. */
export const QUOTE_PDF_VIEWPORT = {
  width: 544,
  height: 860,
}

/** Public report column: max-w-2xl (42rem) + px-4 gutters. */
export const REPORT_PDF_VIEWPORT = {
  width: 704,
  height: 990,
}

function formatMoney(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function nl2br(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>')
}

/**
 * Shared stylesheet matching public-form-page / quote-brand-header / report cards.
 * @param {{ widthPx: number, heightPx: number }} pageSize
 */
export function publicDocumentStyles(pageSize = QUOTE_PDF_VIEWPORT) {
  const width = Math.round(pageSize.width || QUOTE_PDF_VIEWPORT.width)
  const height = Math.round(pageSize.height || QUOTE_PDF_VIEWPORT.height)

  return `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      background: #f3f4f6;
      color: #111827;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: ${width}px ${height}px;
      margin: 0;
    }
    .page {
      width: ${width}px;
      background: #f3f4f6;
      min-height: 100%;
      padding: 0 0 2rem;
    }
    .quote-brand-header {
      width: 100%;
      padding: 0.75rem 1rem 0.75rem;
      margin: 0;
    }
    .quote-brand-header__main {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.875rem 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      background: #ffffff;
    }
    .quote-brand-header__logo {
      flex-shrink: 0;
      max-height: 3rem;
      max-width: 7.5rem;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 0.375rem;
    }
    .quote-brand-header__copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .quote-brand-header__company {
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
      line-height: 1.2;
    }
    .quote-brand-header__sender {
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      line-height: 1.3;
    }
    .quote-brand-header__email {
      font-size: 0.8125rem;
      color: #2563eb;
      text-decoration: none;
      line-height: 1.3;
    }
    .content {
      width: 100%;
      margin: 0;
      padding: 1.5rem 1rem 0;
    }
    .doc-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
      line-height: 1.25;
    }
    .meta {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: #6b7280;
      line-height: 1.4;
    }
    .message {
      margin: 0.75rem 0 0;
      font-size: 0.875rem;
      color: #374151;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 0.75rem;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      overflow: hidden;
      margin: 1.5rem 0 0;
    }
    table.lines {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    table.lines thead {
      background: #f9fafb;
      color: #4b5563;
      text-align: left;
    }
    table.lines thead {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.lines th {
      padding: 0.5rem 1rem;
      font-weight: 500;
    }
    table.lines th.amount,
    table.lines td.amount {
      text-align: right;
      white-space: nowrap;
    }
    table.lines tbody tr {
      border-top: 1px solid #f3f4f6;
    }
    table.lines td {
      padding: 0.75rem 1rem;
      vertical-align: top;
    }
    .line-name {
      font-weight: 500;
      color: #111827;
    }
    .addon {
      margin-left: 0.5rem;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #d97706;
      font-weight: 600;
    }
    .line-desc {
      margin-top: 0.125rem;
      font-size: 0.75rem;
      color: #6b7280;
    }
    .line-qty {
      margin-top: 0.125rem;
      font-size: 0.75rem;
      color: #9ca3af;
    }
    table.lines tfoot {
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.lines tfoot td {
      padding: 0.5rem 1rem;
      color: #4b5563;
    }
    table.lines tfoot tr.total td {
      padding: 0.75rem 1rem;
      color: #111827;
      font-weight: 600;
    }
    table.lines tfoot tr.total td.amount {
      font-size: 1.125rem;
      font-weight: 700;
    }
    .valid-until {
      margin: 1rem 0 0;
      font-size: 0.75rem;
      color: #6b7280;
    }
    .terms-card {
      margin-top: 1.5rem;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .terms-card h2 {
      margin: 0 0 0.5rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      color: #6b7280;
    }
    .terms-card p {
      margin: 0;
      font-size: 0.875rem;
      color: #374151;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .sections {
      margin-top: 1.5rem;
    }
    .section-card {
      margin: 0 0 1.5rem;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .section-body {
      padding: 1.25rem 1.25rem 0.75rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      line-height: 1.3;
    }
    .section-desc {
      margin: 0.5rem 0 0;
      font-size: 0.875rem;
      color: #4b5563;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .photo-grid {
      margin-top: 0.25rem;
      padding: 0 1.25rem 1.25rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }
    .photo-tile {
      position: relative;
      aspect-ratio: 1 / 1;
      border-radius: 0.5rem;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      background: #f3f4f6;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .photo-tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .empty-photos {
      padding: 0 1.25rem 1.25rem;
      margin: 0;
      font-size: 0.75rem;
      color: #9ca3af;
    }
  `
}

function brandHeaderHtml(branding) {
  if (!branding) return ''
  const company = (branding.businessName || '').trim()
  const sender = (branding.senderName || '').trim()
  const email = (branding.senderEmail || '').trim()
  const logo = branding.logoBase64 || ''
  if (!company && !logo && !sender && !email) return ''

  return `
    <header class="quote-brand-header">
      <div class="quote-brand-header__main">
        ${logo ? `<img class="quote-brand-header__logo" src="${escapeHtml(logo)}" alt="" />` : ''}
        <div class="quote-brand-header__copy">
          ${company ? `<div class="quote-brand-header__company">${escapeHtml(company)}</div>` : ''}
          ${sender ? `<div class="quote-brand-header__sender">${escapeHtml(sender)}</div>` : ''}
          ${email ? `<div class="quote-brand-header__email">${escapeHtml(email)}</div>` : ''}
        </div>
      </div>
    </header>
  `
}

function wrapDocument({ title, bodyHtml, pageSize }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${pageSize.width}, initial-scale=1" />
  <title>${escapeHtml(title || 'Document')}</title>
  <style>${publicDocumentStyles(pageSize)}</style>
</head>
<body>
  <div class="page">
    ${bodyHtml}
  </div>
</body>
</html>`
}

/**
 * @param {{ quote: object, invite?: object, branding?: object }} opts
 */
export function buildQuoteDocumentHtml({ quote, invite, branding }) {
  const optionalIds = new Set((quote.lineItems || []).filter((l) => l.isOptional).map((l) => l.id))
  const locked = ['accepted', 'paid'].includes(quote.status)
  const selectedOptionalIds = locked
    ? (quote.acceptedLineIds || []).filter((id) => optionalIds.has(id))
    : []

  const totals = computeQuoteTotals(quote.lineItems || [], quote.taxRate || 0, {
    selectedOptionalIds: locked ? selectedOptionalIds : [],
  })

  const includedIds = new Set(
    locked
      ? resolveAcceptedLineIds(quote.lineItems, selectedOptionalIds)
      : (quote.lineItems || []).map((i) => i.id),
  )

  const displaySubtotal = locked ? (quote.acceptedSubtotal ?? totals.subtotal) : totals.subtotal
  const displayTax = locked ? (quote.acceptedTax ?? totals.taxAmount) : totals.taxAmount
  const displayTotal = locked ? (quote.acceptedTotal ?? quote.total ?? totals.total) : totals.total

  const clientLabel = quote.clientName || invite?.recipientEmail || ''
  const message = (invite?.message || '').trim()

  const rows = (quote.lineItems || [])
    .filter((item) => includedIds.has(item.id))
    .map((item) => {
      const isOptional = !!item.isOptional
      const amountCell = item.hidePriceFromClient
        ? 'Included'
        : formatMoney(item.amount)
      return `
        <tr>
          <td>
            <div class="line-name">
              ${escapeHtml(item.name || 'Line item')}
              ${isOptional ? '<span class="addon">Add-on</span>' : ''}
            </div>
            ${item.description?.trim() ? `<div class="line-desc">${escapeHtml(item.description.trim())}</div>` : ''}
            ${item.quantity > 1 && item.unitPrice != null && !item.hidePriceFromClient
              ? `<div class="line-qty">Qty ${escapeHtml(String(item.quantity))} × ${escapeHtml(formatMoney(item.unitPrice))}</div>`
              : ''}
          </td>
          <td class="amount">${escapeHtml(amountCell)}</td>
        </tr>
      `
    })
    .join('')

  const pdfBranding = branding
    ? {
        ...branding,
        senderName: quote.createdByName || branding.senderName,
        senderEmail: branding.senderEmail || quote.ownerEmail || '',
      }
    : null

  const bodyHtml = `
    ${brandHeaderHtml(pdfBranding)}
    <div class="content">
      <h1 class="doc-title">${escapeHtml(quote.title || 'Quote')}</h1>
      ${clientLabel ? `<p class="meta">Prepared for ${escapeHtml(clientLabel)}</p>` : ''}
      ${message ? `<p class="message">${nl2br(message)}</p>` : ''}

      <div class="card">
        <table class="lines">
          <thead>
            <tr>
              <th>Service</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td>Subtotal</td>
              <td class="amount">${escapeHtml(formatMoney(displaySubtotal))}</td>
            </tr>
            ${totals.taxRate > 0 || displayTax > 0 ? `
            <tr>
              <td>Tax</td>
              <td class="amount">${escapeHtml(formatMoney(displayTax))}</td>
            </tr>` : ''}
            <tr class="total">
              <td>Total</td>
              <td class="amount">${escapeHtml(formatMoney(displayTotal))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${quote.validUntil
        ? `<p class="valid-until">Valid until ${escapeHtml(String(quote.validUntil).slice(0, 10))}</p>`
        : ''}

      ${quote.terms?.trim() ? `
      <div class="terms-card">
        <h2>Terms</h2>
        <p>${nl2br(quote.terms.trim())}</p>
      </div>` : ''}
    </div>
  `

  return wrapDocument({
    title: quote.title || 'Quote',
    bodyHtml,
    pageSize: QUOTE_PDF_VIEWPORT,
  })
}

/**
 * @param {{
 *   report: object,
 *   lead: { name?: string, address?: string } | object,
 *   branding?: object,
 *   message?: string,
 *   photos: Array<{ id: string, dataUri: string, caption?: string }>
 * }} opts
 */
export function buildReportDocumentHtml({ report, lead, branding, message = '', photos = [] }) {
  const photosById = Object.fromEntries((photos || []).map((p) => [p.id, p]))
  const leadName = lead?.name || [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || ''
  const address = lead?.address || ''
  const sections = [...(report?.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const sectionHtml = sections.map((sec) => {
    const photoIds = sec.photoIds || []
    const tiles = photoIds
      .map((id) => photosById[id])
      .filter(Boolean)
      .map((photo) => `
        <div class="photo-tile">
          <img src="${escapeHtml(photo.dataUri)}" alt="${escapeHtml(photo.caption || 'Report photo')}" />
        </div>
      `)
      .join('')

    return `
      <section class="section-card">
        <div class="section-body">
          ${sec.subtitle ? `<h2 class="section-title">${escapeHtml(sec.subtitle)}</h2>` : ''}
          ${sec.description ? `<p class="section-desc">${nl2br(sec.description)}</p>` : ''}
        </div>
        ${tiles
          ? `<div class="photo-grid">${tiles}</div>`
          : `<p class="empty-photos">No photos in this section</p>`}
      </section>
    `
  }).join('')

  const bodyHtml = `
    ${brandHeaderHtml(branding)}
    <div class="content">
      <h1 class="doc-title">${escapeHtml(report?.title || 'Photo Report')}</h1>
      ${leadName ? `<p class="meta">Prepared for ${escapeHtml(leadName)}</p>` : ''}
      ${address ? `<p class="meta">${escapeHtml(address)}</p>` : ''}
      ${message?.trim() ? `<p class="message">${nl2br(message.trim())}</p>` : ''}
      <div class="sections">
        ${sectionHtml}
      </div>
    </div>
  `

  return wrapDocument({
    title: report?.title || 'Photo Report',
    bodyHtml,
    pageSize: REPORT_PDF_VIEWPORT,
  })
}
