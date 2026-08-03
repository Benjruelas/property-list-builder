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
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .photo-row {
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
    .google-reviews {
      margin: 0 0 1.5rem;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1rem;
    }
    .google-reviews__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .google-reviews__mark {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .google-reviews__label {
      margin: 0;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .google-reviews__rating-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 0.15rem;
      flex-wrap: wrap;
    }
    .google-reviews__avg {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
    }
    .google-reviews__count {
      font-size: 0.75rem;
      color: #6b7280;
    }
    .google-reviews__stars {
      color: #fbbf24;
      letter-spacing: 0.05em;
      font-size: 0.8rem;
      line-height: 1;
    }
    .google-reviews__stars span {
      color: #d1d5db;
    }
    .google-reviews__stars span.filled {
      color: #fbbf24;
    }
    .google-reviews__item {
      border-top: 1px solid #f3f4f6;
      padding-top: 0.75rem;
      margin-top: 0.75rem;
    }
    .google-reviews__item:first-of-type {
      border-top: 0;
      padding-top: 0;
      margin-top: 0;
    }
    .google-reviews__name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #111827;
      margin: 0 0 0.15rem;
    }
    .google-reviews__comment {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: #4b5563;
      line-height: 1.45;
    }
    /* Discrete print sheets: page 1 top-aligned, later pages vertically centered. */
    .pdf-shell {
      width: ${width}px;
      background: #f3f4f6;
    }
    .pdf-sheet {
      width: ${width}px;
      height: ${height}px;
      background: #f3f4f6;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      box-sizing: border-box;
      padding: 1.25rem 0;
      page-break-after: always;
      break-after: page;
    }
    .pdf-sheet--centered {
      justify-content: center;
    }
    .pdf-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .pdf-sheet__inner {
      width: 100%;
    }
    .pdf-sheet__inner > .quote-brand-header:first-child {
      padding-top: 0;
    }
    .pdf-sheet--centered .content {
      padding-top: 0;
    }
    .pdf-sheet .sections {
      margin-top: 0;
    }
    .pdf-sheet .section-card:last-child {
      margin-bottom: 0;
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
    <header class="quote-brand-header" data-pdf-block>
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

function starsHtml(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0))
  let html = ''
  for (let i = 1; i <= 5; i += 1) {
    html += `<span class="${value >= i - 0.25 ? 'filled' : ''}">★</span>`
  }
  return `<span class="google-reviews__stars" aria-label="${value} out of 5 stars">${html}</span>`
}

const GOOGLE_MARK_SVG = `<svg class="google-reviews__mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`

export function googleReviewsHtml(googleReviews) {
  const featured = Array.isArray(googleReviews?.featuredReviews)
    ? googleReviews.featuredReviews.slice(0, 3)
    : []
  if (!featured.length) return ''

  const averageRating = Number(googleReviews.averageRating) || 0
  const totalReviewCount = Number(googleReviews.totalReviewCount) || 0
  const items = featured.map((review) => {
    const name = escapeHtml(review.reviewerName || 'Google user')
    const comment = (review.comment || '').trim()
    return `
      <div class="google-reviews__item">
        <p class="google-reviews__name">${name} ${starsHtml(review.starRating)}</p>
        ${comment ? `<p class="google-reviews__comment">${escapeHtml(comment)}</p>` : ''}
      </div>
    `
  }).join('')

  return `
    <section class="google-reviews" data-pdf-block aria-label="Google reviews">
      <div class="google-reviews__header">
        ${GOOGLE_MARK_SVG}
        <div>
          <p class="google-reviews__label">Google reviews</p>
          <div class="google-reviews__rating-row">
            <span class="google-reviews__avg">${escapeHtml(averageRating.toFixed(1))}</span>
            ${starsHtml(averageRating)}
            ${totalReviewCount > 0
              ? `<span class="google-reviews__count">(${totalReviewCount} review${totalReviewCount === 1 ? '' : 's'})</span>`
              : ''}
          </div>
        </div>
      </div>
      ${items}
    </section>
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
      <div data-pdf-block>
        <h1 class="doc-title">${escapeHtml(quote.title || 'Quote')}</h1>
        ${clientLabel ? `<p class="meta">Prepared for ${escapeHtml(clientLabel)}</p>` : ''}
        ${message ? `<p class="message">${nl2br(message)}</p>` : ''}
      </div>

      <div class="card" data-pdf-block>
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
        ? `<p class="valid-until" data-pdf-block>Valid until ${escapeHtml(String(quote.validUntil).slice(0, 10))}</p>`
        : ''}

      ${quote.terms?.trim() ? `
      <div class="terms-card" data-pdf-block>
        <h2>Terms</h2>
        <p>${nl2br(quote.terms.trim())}</p>
      </div>` : ''}

      ${googleReviewsHtml(pdfBranding?.googleReviews || branding?.googleReviews)}
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

  const sectionHtml = sections.map((sec, secIndex) => {
    const groupId = `sec-${sec.id || secIndex}`
    const photoIds = sec.photoIds || []
    const photoRecords = photoIds
      .map((id) => photosById[id])
      .filter(Boolean)

    const rows = []
    for (let i = 0; i < photoRecords.length; i += 3) {
      const slice = photoRecords.slice(i, i + 3)
      const tiles = slice.map((photo) => `
        <div class="photo-tile">
          <img src="${escapeHtml(photo.dataUri)}" alt="${escapeHtml(photo.caption || 'Report photo')}" />
        </div>
      `).join('')
      rows.push(`<div class="photo-row" data-pdf-block data-pdf-group="${escapeHtml(groupId)}">${tiles}</div>`)
    }

    const hasBody = !!(sec.subtitle || sec.description)
    return `
      <section class="section-card" data-pdf-section="${escapeHtml(groupId)}">
        ${hasBody ? `
        <div class="section-body" data-pdf-block data-pdf-group="${escapeHtml(groupId)}">
          ${sec.subtitle ? `<h2 class="section-title">${escapeHtml(sec.subtitle)}</h2>` : ''}
          ${sec.description ? `<p class="section-desc">${nl2br(sec.description)}</p>` : ''}
        </div>` : ''}
        ${rows.length
          ? `<div class="photo-grid">${rows.join('')}</div>`
          : `<p class="empty-photos" data-pdf-block data-pdf-group="${escapeHtml(groupId)}">No photos in this section</p>`}
      </section>
    `
  }).join('')

  const bodyHtml = `
    ${brandHeaderHtml(branding)}
    <div class="content">
      <div data-pdf-block>
        <h1 class="doc-title">${escapeHtml(report?.title || 'Photo Report')}</h1>
        ${leadName ? `<p class="meta">Prepared for ${escapeHtml(leadName)}</p>` : ''}
        ${address ? `<p class="meta">${escapeHtml(address)}</p>` : ''}
        ${message?.trim() ? `<p class="message">${nl2br(message.trim())}</p>` : ''}
      </div>
      <div class="sections">
        ${sectionHtml}
      </div>
      ${googleReviewsHtml(branding?.googleReviews)}
    </div>
  `

  return wrapDocument({
    title: report?.title || 'Photo Report',
    bodyHtml,
    pageSize: REPORT_PDF_VIEWPORT,
  })
}
