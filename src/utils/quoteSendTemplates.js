/**
 * Quote send message templates and tag substitution.
 */

import { formatQuoteMoney } from './quoteMath'
import {
  replaceMustacheTags,
  mustacheToTagEditorHtml,
  tagEditorDomToMustache,
} from './sendTemplateTags'
import { passThroughLeadFieldValues } from './leadSendTags'

export const QUOTE_SEND_TAGS = [
  { key: 'firstName', tag: '{{firstName}}', label: 'First Name' },
  { key: 'lastName', tag: '{{lastName}}', label: 'Last Name' },
  { key: 'quoteTitle', tag: '{{quoteTitle}}', label: 'Title' },
  { key: 'quoteTotal', tag: '{{quoteTotal}}', label: 'Total' },
  { key: 'quoteLink', tag: '{{quoteLink}}', label: 'Quote Link' },
  { key: 'senderName', tag: '{{senderName}}', label: 'Your Name' },
  { key: 'validUntil', tag: '{{validUntil}}', label: 'Valid Until' },
  { key: 'companyName', tag: '{{companyName}}', label: 'Company Name' },
]

/** Keys that render as pills (includes legacy clientName for saved templates). */
const PILL_TAG_LABELS = {
  ...Object.fromEntries(QUOTE_SEND_TAGS.map((t) => [t.key, t.label])),
  clientName: 'Client Name',
}

export const DEFAULT_QUOTE_EMAIL_TEMPLATE = {
  subject: 'Quote from {{senderName}} — {{quoteTitle}}',
  body: `Hi {{firstName}},

Please review your quote for {{quoteTitle}} ({{quoteTotal}}).

View and respond here: {{quoteLink}}

This quote is valid until {{validUntil}}.

Thank you,
{{senderName}}`,
}

export const DEFAULT_QUOTE_TEXT_TEMPLATE = {
  body: `Hi {{firstName}}, here's your quote for {{quoteTitle}} ({{quoteTotal}}): {{quoteLink}} — valid until {{validUntil}}. Reply with any questions!`,
}

function formatTotalForTag(quoteTotal) {
  if (quoteTotal == null || quoteTotal === '') return ''
  const s = String(quoteTotal)
  if (s.includes('$')) return s
  return formatQuoteMoney(quoteTotal)
}

/** Resolve values for outbound send (sensible fallbacks). Supports legacy {{clientName}}. */
export function buildQuoteTagValues(data = {}) {
  const senderName = data.senderName || data.senderEmail?.split('@')[0] || 'Your rep'
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const clientName = String(data.clientName || '').trim()
    || [firstName, lastName].filter(Boolean).join(' ')
    || 'there'
  return {
    firstName: firstName || (clientName !== 'there' ? clientName.split(/\s+/)[0] : '') || 'there',
    lastName,
    clientName,
    quoteTitle: data.quoteTitle || 'your quote',
    quoteTotal: formatTotalForTag(data.quoteTotal),
    quoteLink: data.quoteLink || '',
    senderName,
    validUntil: data.validUntil || '',
    companyName: data.companyName || 'KnockScout',
  }
}

export function getQuoteTagLabel(key) {
  return PILL_TAG_LABELS[key] || key
}

/** Pill label: resolved value when present, otherwise attribute name (no send fallbacks). */
export function getQuoteTagPillText(key, data = {}) {
  const label = getQuoteTagLabel(key)
  let raw = ''
  switch (key) {
    case 'firstName':
      raw = data.firstName || ''
      break
    case 'lastName':
      raw = data.lastName || ''
      break
    case 'clientName':
      raw = data.clientName || [data.firstName, data.lastName].filter(Boolean).join(' ') || ''
      break
    case 'quoteTitle':
      raw = data.quoteTitle || ''
      break
    case 'quoteTotal':
      raw = formatTotalForTag(data.quoteTotal)
      break
    case 'quoteLink':
      raw = data.quoteLink || ''
      break
    case 'senderName':
      raw = data.senderName || data.senderEmail?.split('@')[0] || ''
      break
    case 'validUntil':
      raw = data.validUntil || ''
      break
    case 'companyName':
      raw = data.companyName || ''
      break
    default:
      raw = data[key] || ''
  }
  const text = String(raw).trim()
  if (!text || text === '[link will appear after send]') return label
  return text
}

export function replaceQuoteTags(text, data = {}) {
  if (!text) return ''
  return replaceMustacheTags(text, passThroughLeadFieldValues(buildQuoteTagValues(data), data))
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

export function isQuotePillTagKey(key) {
  return Boolean(PILL_TAG_LABELS[key])
}

/** Convert mustache template text → contentEditable HTML with pills. */
export function mustacheToQuoteEditorHtml(text, data = {}) {
  return mustacheToTagEditorHtml(text, data, QUOTE_SEND_TAGS, (key, d) => getQuoteTagPillText(key, d))
}

/** Serialize contentEditable root back to mustache template text. */
export function quoteEditorDomToMustache(root) {
  return tagEditorDomToMustache(root, QUOTE_SEND_TAGS)
}
