import Stripe from 'stripe'
import { markQuotePaidFromStripe } from './public-quote.js'

const stripeKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!stripeKey || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const sig = req.headers['stripe-signature']

  let event
  try {
    const rawBody = await readRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Stripe webhook signature error', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      if (session.payment_status === 'paid') {
        await markQuotePaidFromStripe(session.metadata || {}, session.payment_intent)
      }
    }
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('stripe-webhook handler error', err)
    return res.status(500).json({ error: 'Webhook handler failed' })
  }
}
