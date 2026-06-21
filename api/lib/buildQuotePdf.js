import PDFDocument from 'pdfkit'
import { computeQuoteTotals, resolveAcceptedLineIds } from './quoteMath.js'

const MG = 48
const CW = 612 - 2 * MG

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

function formatMoney(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * @param {{ quote: object, invite: object, branding: object }} opts
 */
export async function buildQuotePdfBuffer({ quote, invite, branding }) {
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
      : totals.includedLineIds,
  )

  const doc = new PDFDocument({ size: 'LETTER', margin: MG })
  let y = MG

  if (branding?.logoBase64) {
    try {
      const logoBuf = Buffer.from(branding.logoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
      doc.image(logoBuf, MG, y, { width: 80 })
      y += 50
    } catch {
      /* skip logo */
    }
  }

  doc.fontSize(10).fillColor('#555555')
  const companyLines = [
    branding?.businessName,
    branding?.companyPhone,
    branding?.companyEmail,
    branding?.companyWebsite,
  ].filter(Boolean)
  companyLines.forEach((line) => {
    doc.text(line, MG, y, { width: CW })
    y += 14
  })
  y += 16

  doc.fontSize(22).fillColor('#111111').text(quote.title || 'Quote', MG, y, { width: CW })
  y = doc.y + 10

  const clientLabel = quote.clientName || invite?.recipientEmail || ''
  if (clientLabel) {
    doc.fontSize(12).fillColor('#333333').text(`Prepared for ${clientLabel}`, MG, y, { width: CW })
    y = doc.y + 8
  }

  const message = invite?.message || ''
  if (message.trim()) {
    doc.fontSize(10).fillColor('#444444').text(message.trim(), MG, y, { width: CW })
    y = doc.y + 14
  }

  doc.fontSize(11).fillColor('#111111')
  doc.text('Service', MG, y)
  doc.text('Amount', MG + CW - 80, y, { width: 80, align: 'right' })
  y += 18
  doc.moveTo(MG, y).lineTo(MG + CW, y).strokeColor('#cccccc').stroke()
  y += 8

  for (const item of quote.lineItems || []) {
    if (!includedIds.has(item.id)) continue
    const name = item.name || 'Line item'
    const desc = item.description?.trim()
    doc.fontSize(10).fillColor('#111111').text(name, MG, y, { width: CW - 90 })
    const rowTop = y
    if (!item.hidePriceFromClient) {
      doc.text(formatMoney(item.amount), MG + CW - 80, rowTop, { width: 80, align: 'right' })
    }
    y = doc.y + (desc ? 0 : 4)
    if (desc) {
      doc.fontSize(9).fillColor('#666666').text(desc, MG, doc.y + 2, { width: CW - 90 })
      y = doc.y + 6
    }
    if (item.isOptional) {
      doc.fontSize(8).fillColor('#888888').text('Optional add-on', MG, y, { width: CW - 90 })
      y = doc.y + 4
    }
    y += 6
  }

  y += 8
  doc.moveTo(MG, y).lineTo(MG + CW, y).strokeColor('#cccccc').stroke()
  y += 12

  const displaySubtotal = locked ? (quote.acceptedSubtotal ?? totals.subtotal) : totals.subtotal
  const displayTax = locked ? (quote.acceptedTax ?? totals.taxAmount) : totals.taxAmount
  const displayTotal = locked ? (quote.acceptedTotal ?? quote.total ?? totals.total) : totals.total

  doc.fontSize(10).fillColor('#333333')
  doc.text('Subtotal', MG, y)
  doc.text(formatMoney(displaySubtotal), MG + CW - 80, y, { width: 80, align: 'right' })
  y += 16
  if (totals.taxRate > 0) {
    doc.text(`Tax (${totals.taxRate}%)`, MG, y)
    doc.text(formatMoney(displayTax), MG + CW - 80, y, { width: 80, align: 'right' })
    y += 16
  }
  doc.fontSize(12).fillColor('#111111')
  doc.text('Total', MG, y)
  doc.text(formatMoney(displayTotal), MG + CW - 80, y, { width: 80, align: 'right' })
  y = doc.y + 16

  if (quote.validUntil) {
    doc.fontSize(9).fillColor('#666666').text(`Valid until ${String(quote.validUntil).slice(0, 10)}`, MG, y, { width: CW })
    y = doc.y + 12
  }

  if (quote.terms?.trim()) {
    y += 8
    doc.fontSize(10).fillColor('#111111').text('Terms', MG, y, { width: CW })
    y = doc.y + 6
    doc.fontSize(9).fillColor('#444444').text(quote.terms.trim(), MG, y, { width: CW })
  }

  return pdfToBuffer(doc)
}

export function safeQuotePdfFilename(title) {
  const base = String(title || 'quote').replace(/[^\w\s-]/g, '').trim() || 'quote'
  return `${base.slice(0, 80)}.pdf`
}
