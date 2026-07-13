import Stripe from 'stripe'
import {
  findQuoteInviteByToken,
  getAllQuoteInvites,
  saveAllQuoteInvites,
  escapeHtml,
} from './_lib/quoteInvites.js'
import { getQuoteById, updateQuoteAtIndex } from './_lib/quoteStore.js'
import { parseQuotePreviewToken } from './_lib/previewToken.js'
import { enforceIpRateLimit } from './_lib/rateLimit.js'
import { syncQuotePaymentOnPaid, syncQuoteToDealOnAccept } from './_lib/syncQuoteToDeal.js'
import {
  computeQuoteTotals,
  publicQuoteLineItem,
  resolveAcceptedLineIds,
} from './_lib/quoteMath.js'
import { logTeamActivity, actorLabel } from './_lib/activityLog.js'
import { resolveSenderBranding } from './_lib/senderBranding.js'
import { buildQuotePdfBuffer, safeQuotePdfFilename } from './_lib/buildQuotePdf.js'
import { buildQuotePublicPath } from './_lib/publicLinks.js'

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

async function publicQuotePayload(quote, invite, { selectedOptionalIds = [], token = '' } = {}) {
  const optionalIds = (quote.lineItems || []).filter((l) => l.isOptional).map((l) => l.id)
  const totals = computeQuoteTotals(quote.lineItems || [], quote.taxRate || 0, {
    selectedOptionalIds: quote.status === 'accepted' || quote.status === 'paid'
      ? (quote.acceptedLineIds || []).filter((id) => optionalIds.includes(id))
      : selectedOptionalIds,
  })
  const requiredOnly = computeQuoteTotals(quote.lineItems || [], quote.taxRate || 0, {
    selectedOptionalIds: [],
  })

  let branding = null
  if (quote.ownerId) {
    try {
      branding = await resolveSenderBranding({
        uid: quote.ownerId,
        email: quote.ownerEmail || '',
      })
    } catch {
      branding = null
    }
  }

  return {
    title: quote.title,
    clientName: quote.clientName,
    recipientEmail: invite.recipientEmail,
    message: invite.message || '',
    lineItems: (quote.lineItems || []).map(publicQuoteLineItem).filter(Boolean),
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: quote.acceptedTotal ?? totals.total,
    requiredSubtotal: requiredOnly.subtotal,
    requiredTotal: requiredOnly.total,
    optionalLineIds: optionalIds,
    validUntil: quote.validUntil,
    terms: quote.terms || '',
    status: quote.status,
    paymentEnabled: !!quote.paymentEnabled,
    stripeConfigured: !!stripeKey,
    clientResponse: quote.clientResponse || null,
    paidAt: quote.paidAt || null,
    acceptedLineIds: quote.acceptedLineIds || null,
    viewCount: quote.viewTracking?.viewCount || 0,
    preview: invite.preview === true,
    pdfDownloadUrl: invite.preview !== true && token
      ? `/api/public-quote?token=${encodeURIComponent(token)}&download=1`
      : null,
    branding: branding
      ? {
          businessName: branding.businessName,
          logoBase64: branding.logoBase64,
          senderName: quote.createdByName || branding.senderName,
          senderEmail: branding.senderEmail || quote.ownerEmail || '',
        }
      : null,
  }
}

async function recordQuoteView(quote, index, all, invite) {
  const now = new Date().toISOString()
  const vt = quote.viewTracking || { viewCount: 0 }
  const isFirst = !vt.firstViewedAt
  const updated = {
    ...quote,
    viewTracking: {
      firstViewedAt: vt.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: (vt.viewCount || 0) + 1,
    },
    status: quote.status === 'sent' ? 'viewed' : quote.status,
    updatedAt: now,
  }
  await updateQuoteAtIndex(all, index, updated)

  if (isFirst) {
    try {
      const { notifyQuoteViewed } = await import('./_lib/pushUtils.js')
      await notifyQuoteViewed(quote.ownerEmail, {
        quoteTitle: quote.title,
        clientName: quote.clientName || invite.recipientEmail,
        quoteId: quote.id,
      })
    } catch {
      /* ignore */
    }
    try {
      await logTeamActivity({
        teamIds: [],
        actor: { email: invite.recipientEmail },
        type: 'quote.viewed',
        summary: `${quote.clientName || invite.recipientEmail} viewed quote "${quote.title || 'Quote'}"`,
        entity: { quoteId: quote.id },
        nav: { panel: 'quotes', quoteId: quote.id },
      })
    } catch {
      /* ignore */
    }
  }

  return updated
}

async function loadQuoteContext(token) {
  const normalized = String(token || '').trim()
  const { invite, index: invIdx, error } = await findQuoteInviteByToken(normalized)

  if (error && error !== 'not_found') {
    if (error === 'revoked') return { error: 'This quote link is no longer active.', status: 410 }
    if (error === 'expired') return { error: 'This quote link has expired.', status: 410 }
  }

  if (!error && invite) {
    const { quote, index, all } = await getQuoteById(invite.quoteId)
    if (!quote) return { error: 'Quote not found', status: 404 }
    return { invite, invIdx, quote, index, all, error: null }
  }

  const signedQuoteId = parseQuotePreviewToken(normalized)
  if (signedQuoteId) {
    const { quote, index, all } = await getQuoteById(signedQuoteId)
    if (!quote) return { error: 'Quote not found', status: 404 }
    const previewInvite = {
      token: normalized,
      quoteId: quote.id,
      preview: true,
      recipientEmail: '',
      message: '',
      status: 'pending',
    }
    return { invite: previewInvite, invIdx: -1, quote, index, all, error: null }
  }

  // Legacy raw `quote.previewToken` KV fallback removed: it bypassed invite
  // expiry/revocation. Access now requires a live invite or a signed preview
  // token (handled above).
  return { error: 'Quote link not found', status: 404 }
}

export const config = {
  maxDuration: 60,
  memory: 1024,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (await enforceIpRateLimit(req, res, { name: 'public-quote', limit: 120, windowSec: 60 })) return

  const token = req.query?.token || (typeof req.body === 'object' ? req.body?.token : null)
  if (!token) return res.status(400).json({ error: 'token is required' })

  try {
    if (req.method === 'GET') {
      const ctx = await loadQuoteContext(token)
      if (ctx.error) return res.status(ctx.status).json({ error: ctx.error })

      const download = req.query.download === '1'
      if (download) {
        if (ctx.invite.preview) {
          return res.status(403).json({ error: 'PDF download is disabled for preview links' })
        }

        const { quote, invite } = ctx
        let branding = null
        if (quote.ownerId) {
          try {
            branding = await resolveSenderBranding({
              uid: quote.ownerId,
              email: quote.ownerEmail || '',
            })
          } catch {
            branding = null
          }
        }

        const pdfBuf = await buildQuotePdfBuffer({ quote, invite, branding })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${safeQuotePdfFilename(quote.title)}"`)
        return res.status(200).send(pdfBuf)
      }

      const updated = ctx.invite.preview
        ? ctx.quote
        : await recordQuoteView(ctx.quote, ctx.index, ctx.all, ctx.invite)
      return res.status(200).json(await publicQuotePayload(updated, ctx.invite, { token }))
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const action = body.action

      const ctx = await loadQuoteContext(body.token || token)
      if (ctx.error) return res.status(ctx.status).json({ error: ctx.error })

      if (ctx.invite.preview) {
        return res.status(403).json({ error: 'This preview link is read-only' })
      }

      let { quote, index, all, invite } = ctx
      const now = new Date().toISOString()

      if (action === 'checkout') {
        if (quote.status !== 'accepted' && quote.status !== 'paid') {
          return res.status(400).json({ error: 'Quote must be accepted before payment' })
        }
        if (quote.status === 'paid') {
          return res.status(400).json({ error: 'Quote is already paid' })
        }
        if (!quote.paymentEnabled) {
          return res.status(400).json({ error: 'Payment is not enabled for this quote' })
        }
        if (!stripe) {
          return res.status(503).json({ error: 'Online payment is not configured' })
        }

        const origin = resolveOrigin(req)
        const quoteToken = invite.token
        const amountCents = Math.round(Number(quote.acceptedTotal ?? quote.total ?? 0) * 100)
        if (amountCents < 50) {
          return res.status(400).json({ error: 'Quote total is too low for payment' })
        }

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: String(quote.title || 'Quote').slice(0, 200),
                  description: `Quote for ${quote.clientName || invite.recipientEmail}`,
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          metadata: {
            quoteId: quote.id,
            inviteToken: quoteToken,
            dealId: quote.dealId || '',
            pipelineId: quote.pipelineId || '',
            paymentLineItemId: quote.paymentLineItemId || '',
          },
          success_url: `${origin}${buildQuotePublicPath(quoteToken, { payment: 'success' })}`,
          cancel_url: `${origin}${buildQuotePublicPath(quoteToken, { payment: 'cancel' })}`,
        })

        quote = { ...quote, stripeSessionId: session.id, updatedAt: now }
        await updateQuoteAtIndex(all, index, quote)

        return res.status(200).json({ checkoutUrl: session.url })
      }

      const validActions = new Set(['accept', 'decline', 'request_change'])
      if (!validActions.has(action)) {
        return res.status(400).json({ error: 'Invalid action' })
      }

      if (['accepted', 'declined', 'paid'].includes(quote.status)) {
        return res.status(410).json({
          error: 'This quote has already been responded to',
          status: quote.status,
          clientResponse: quote.clientResponse,
        })
      }

      const statusMap = {
        accept: 'accepted',
        decline: 'declined',
        request_change: 'change_requested',
      }

      const message = String(body.message || '').slice(0, 4000)
      const selectedOptionalIds = Array.isArray(body.selectedOptionalIds)
        ? body.selectedOptionalIds.filter(Boolean).map(String)
        : []

      if (action === 'accept') {
        const optionalIds = new Set((quote.lineItems || []).filter((l) => l.isOptional).map((l) => l.id))
        for (const id of selectedOptionalIds) {
          if (!optionalIds.has(id)) {
            return res.status(400).json({ error: 'Invalid optional line selection' })
          }
        }
      }

      const acceptedLineIds = action === 'accept'
        ? resolveAcceptedLineIds(quote.lineItems, selectedOptionalIds)
        : null
      const acceptedTotals = action === 'accept'
        ? computeQuoteTotals(quote.lineItems, quote.taxRate || 0, { selectedOptionalIds })
        : null

      quote = {
        ...quote,
        status: statusMap[action],
        clientResponse: {
          action,
          message,
          respondedAt: now,
          selectedOptionalIds: action === 'accept' ? selectedOptionalIds : undefined,
        },
        acceptedLineIds: acceptedLineIds || quote.acceptedLineIds,
        acceptedSubtotal: acceptedTotals?.subtotal ?? quote.acceptedSubtotal,
        acceptedTax: acceptedTotals?.taxAmount ?? quote.acceptedTax,
        acceptedTotal: acceptedTotals?.total ?? quote.acceptedTotal,
        subtotal: acceptedTotals?.subtotal ?? quote.subtotal,
        taxAmount: acceptedTotals?.taxAmount ?? quote.taxAmount,
        total: acceptedTotals?.total ?? quote.total,
        updatedAt: now,
      }
      await updateQuoteAtIndex(all, index, quote)

      if (action === 'accept' && quote.pipelineId && quote.dealId) {
        try {
          await syncQuoteToDealOnAccept(quote)
        } catch (e) {
          console.warn('syncQuoteToDealOnAccept failed', e.message)
        }
      }

      try {
        const { notifyQuoteResponded } = await import('./_lib/pushUtils.js')
        await notifyQuoteResponded(quote.ownerEmail, {
          quoteTitle: quote.title,
          action,
          clientName: quote.clientName || invite.recipientEmail,
          message,
          quoteId: quote.id,
        })
      } catch {
        /* ignore */
      }

      try {
        const typeMap = {
          accept: 'quote.accepted',
          decline: 'quote.declined',
          request_change: 'quote.change_requested',
        }
        await logTeamActivity({
          teamIds: [],
          actor: { email: invite.recipientEmail },
          type: typeMap[action],
          summary: `${quote.clientName || invite.recipientEmail} ${action.replace('_', ' ')} quote "${quote.title || 'Quote'}"`,
          entity: { quoteId: quote.id, message },
          nav: { panel: 'quotes', quoteId: quote.id },
        })
      } catch {
        /* ignore */
      }

      const canPay = action === 'accept' && quote.paymentEnabled && quote.status !== 'paid' && !!stripeKey
      return res.status(200).json({
        ok: true,
        status: quote.status,
        canPay,
        stripeConfigured: !!stripeKey,
        quote: await publicQuotePayload(quote, invite, { token: body.token || token }),
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('public-quote error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

/** Called from stripe webhook after successful payment */
export async function markQuotePaidFromStripe(metadata, paymentIntentId) {
  const quoteId = metadata?.quoteId
  if (!quoteId) return { ok: false }

  const { quote, index, all } = await getQuoteById(quoteId)
  if (!quote) return { ok: false }
  if (quote.status === 'paid') return { ok: true, quote }

  const now = new Date().toISOString()
  const updated = {
    ...quote,
    status: 'paid',
    paidAt: now,
    stripePaymentIntentId: paymentIntentId || null,
    updatedAt: now,
  }
  await updateQuoteAtIndex(all, index, updated)

  if (quote.pipelineId && quote.dealId) {
    await syncQuotePaymentOnPaid(updated)
  }

  try {
    const { notifyQuotePaid } = await import('./_lib/pushUtils.js')
    await notifyQuotePaid(updated.ownerEmail, {
      quoteTitle: updated.title,
      clientName: updated.clientName,
      amount: updated.acceptedTotal ?? updated.total,
      quoteId: updated.id,
    })
  } catch {
    /* ignore */
  }

  try {
    await logTeamActivity({
      teamIds: [],
      actor: { email: quote.clientEmail },
      type: 'quote.paid',
      summary: `Quote "${quote.title || 'Quote'}" paid (${quote.clientName || 'client'})`,
      entity: { quoteId: quote.id },
      nav: { panel: 'quotes', quoteId: quote.id },
    })
  } catch {
    /* ignore */
  }

  return { ok: true, quote: updated }
}
