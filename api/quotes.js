import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import { resolveSenderBranding } from './lib/senderBranding.js'
import { getAllQuoteTemplates } from './lib/quoteStore.js'
import { getAllQuotes, saveAllQuotes, getQuoteById } from './lib/quoteStore.js'
import {
  computeQuoteTotals,
  computeQuoteProfitSummary,
  defaultValidUntil,
  normalizeQuoteStatus,
} from './lib/quoteMath.js'

/**
 * Quote instances CRUD — owner-only v1.
 */

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function buildQuoteFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  let lineItems = body.lineItems ?? existing?.lineItems ?? []
  if (body.globalMarkupPercent !== undefined && body.globalMarkupPercent !== null) {
    const rate = Math.max(0, parseFloat(body.globalMarkupPercent) || 0)
    lineItems = (lineItems || []).map((item) =>
      item?.priceOverridden ? item : { ...item, markupPercent: rate }
    )
  }
  const totals = computeQuoteTotals(lineItems, body.taxRate ?? existing?.taxRate ?? 0)
  const validDays = body.defaultValidDays ?? existing?.defaultValidDays ?? 30
  const profitSummary = computeQuoteProfitSummary(totals.lineItems)

  return {
    id: existing?.id || `quote_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    templateId: body.templateId ?? existing?.templateId ?? null,
    title: String(body.title ?? existing?.title ?? 'Quote').trim().slice(0, 200),
    clientName: String(body.clientName ?? existing?.clientName ?? '').trim().slice(0, 200),
    clientEmail: String(body.clientEmail ?? existing?.clientEmail ?? '').trim().toLowerCase().slice(0, 200),
    clientPhone: String(body.clientPhone ?? existing?.clientPhone ?? '').trim().slice(0, 40),
    lineItems: totals.lineItems,
    globalMarkupPercent: body.globalMarkupPercent ?? existing?.globalMarkupPercent ?? null,
    terms: String(body.terms ?? existing?.terms ?? '').slice(0, 8000),
    notes: String(body.notes ?? existing?.notes ?? '').slice(0, 4000),
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    profitSummary,
    validUntil: body.validUntil ?? existing?.validUntil ?? defaultValidUntil(validDays),
    status: existing?.status || 'draft',
    leadId: body.leadId ?? existing?.leadId ?? null,
    dealId: body.dealId ?? existing?.dealId ?? null,
    pipelineId: body.pipelineId ?? existing?.pipelineId ?? null,
    paymentLineItemId: body.paymentLineItemId ?? existing?.paymentLineItemId ?? null,
    paymentEnabled: body.paymentEnabled !== undefined ? !!body.paymentEnabled : (existing?.paymentEnabled ?? false),
    ownerId: existing?.ownerId || user.uid,
    ownerEmail: existing?.ownerEmail || user.email,
    createdByName: existing?.createdByName || body.createdByName || '',
    clientResponse: existing?.clientResponse ?? null,
    viewTracking: existing?.viewTracking ?? null,
    acceptedLineIds: existing?.acceptedLineIds ?? null,
    acceptedSubtotal: existing?.acceptedSubtotal ?? null,
    acceptedTax: existing?.acceptedTax ?? null,
    acceptedTotal: existing?.acceptedTotal ?? null,
    paidAt: existing?.paidAt ?? null,
    stripePaymentIntentId: existing?.stripePaymentIntentId ?? null,
    stripeSessionId: existing?.stripeSessionId ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sentAt: existing?.sentAt ?? null,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const { quoteId, dealId } = req.query || {}
      const all = await getAllQuotes()
      let quotes = all.filter((q) => q.ownerId === user.uid)

      if (quoteId) {
        const q = quotes.find((x) => x.id === quoteId)
        if (!q) return res.status(404).json({ error: 'Quote not found' })
        return res.status(200).json({ quote: q })
      }

      if (dealId) {
        quotes = quotes.filter((q) => q.dealId === dealId)
      }

      quotes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      return res.status(200).json({ quotes })
    }

    if (method === 'POST') {
      const { templateId, fromTemplate } = body
      let seed = body

      if (templateId || fromTemplate) {
        const templates = await getAllQuoteTemplates()
        const tpl = templates.find((t) => t.id === (templateId || fromTemplate))
        if (tpl && tpl.ownerId === user.uid) {
          seed = {
            ...body,
            title: body.title || tpl.title || tpl.name,
            lineItems: body.lineItems || tpl.lineItems,
            terms: body.terms ?? tpl.terms,
            notes: body.notes ?? tpl.notes,
            taxRate: body.taxRate ?? tpl.taxRate ?? 0,
            templateId: tpl.id,
            validUntil: body.validUntil || defaultValidUntil(tpl.defaultValidDays || 30),
          }
        }
      }

      const branding = await resolveSenderBranding(user)
      const quote = buildQuoteFromBody({ ...seed, createdByName: branding.senderName }, user)
      const all = await getAllQuotes()
      all.push(quote)
      await saveAllQuotes(all)
      return res.status(201).json({ quote })
    }

    if (method === 'PATCH') {
      const { quoteId } = body
      if (!quoteId) return res.status(400).json({ error: 'quoteId is required' })

      const { quote: existing, index, all } = await getQuoteById(quoteId)
      if (!existing || existing.ownerId !== user.uid) {
        return res.status(404).json({ error: 'Quote not found' })
      }

      const lockedStatuses = new Set(['paid'])
      if (lockedStatuses.has(existing.status) && body.status === undefined) {
        return res.status(400).json({ error: 'Paid quotes cannot be edited' })
      }

      const updated = buildQuoteFromBody(body, user, existing)

      if (body.status !== undefined) {
        updated.status = normalizeQuoteStatus(body.status)
      }

      if (body.markSent) {
        updated.status = updated.status === 'draft' ? 'sent' : updated.status
        updated.sentAt = new Date().toISOString()
      }

      all[index] = updated
      await saveAllQuotes(all)
      return res.status(200).json({ quote: updated })
    }

    if (method === 'DELETE') {
      const { quoteId } = body
      if (!quoteId) return res.status(400).json({ error: 'quoteId is required' })

      const all = await getAllQuotes()
      const idx = all.findIndex((q) => q.id === quoteId && q.ownerId === user.uid)
      if (idx === -1) return res.status(404).json({ error: 'Quote not found' })

      all.splice(idx, 1)
      await saveAllQuotes(all)
      return res.status(200).json({ message: 'Quote deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('quotes API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
