/**
 * Quote send message templates and tag substitution.
 */

import { formatQuoteMoney } from './quoteMath'

export const QUOTE_SEND_TAGS = [
  { tag: '{{clientName}}', label: 'Client name' },
  { tag: '{{quoteTitle}}', label: 'Quote title' },
  { tag: '{{quoteTotal}}', label: 'Quote total' },
  { tag: '{{quoteLink}}', label: 'Quote link' },
  { tag: '{{senderName}}', label: 'Your name' },
  { tag: '{{validUntil}}', label: 'Valid until' },
  { tag: '{{companyName}}', label: 'Company name' },
]

export const DEFAULT_QUOTE_EMAIL_TEMPLATE = {
  subject: 'Quote from {{senderName}} — {{quoteTitle}}',
  body: `Hi {{clientName}},

Please review your quote for {{quoteTitle}} ({{quoteTotal}}).

View and respond here: {{quoteLink}}

This quote is valid until {{validUntil}}.

Thank you,
{{senderName}}`,
}

export const DEFAULT_QUOTE_TEXT_TEMPLATE = {
  body: `Hi {{clientName}}, here's your quote for {{quoteTitle}} ({{quoteTotal}}): {{quoteLink}} — valid until {{validUntil}}. Reply with any questions!`,
}

export function replaceQuoteTags(text, data = {}) {
  if (!text) return ''
  const senderName = data.senderName || data.senderEmail?.split('@')[0] || 'Your rep'
  const map = {
    clientName: data.clientName || 'there',
    quoteTitle: data.quoteTitle || 'your quote',
    quoteTotal: data.quoteTotal != null ? formatQuoteMoney(data.quoteTotal) : '',
    quoteLink: data.quoteLink || '',
    senderName,
    validUntil: data.validUntil || '',
    companyName: data.companyName || 'KnockScout',
  }
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? '')
}

export function getQuoteSendTemplatesFromSettings(appSettings) {
  const stored = appSettings?.quoteSendTemplates
  return {
    email: {
      subject: stored?.email?.subject || DEFAULT_QUOTE_EMAIL_TEMPLATE.subject,
      body: stored?.email?.body || DEFAULT_QUOTE_EMAIL_TEMPLATE.body,
    },
    text: {
      body: stored?.text?.body || DEFAULT_QUOTE_TEXT_TEMPLATE.body,
    },
  }
}

export function buildQuoteSendTemplatesPatch(email, text) {
  return {
    quoteSendTemplates: {
      email: {
        subject: String(email?.subject || DEFAULT_QUOTE_EMAIL_TEMPLATE.subject).slice(0, 500),
        body: String(email?.body || DEFAULT_QUOTE_EMAIL_TEMPLATE.body).slice(0, 8000),
      },
      text: {
        body: String(text?.body || DEFAULT_QUOTE_TEXT_TEMPLATE.body).slice(0, 2000),
      },
    },
  }
}
