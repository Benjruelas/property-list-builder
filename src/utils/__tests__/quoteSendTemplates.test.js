/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import {
  replaceQuoteTags,
  getQuoteTagPillText,
  mustacheToQuoteEditorHtml,
  quoteEditorDomToMustache,
  DEFAULT_QUOTE_EMAIL_TEMPLATE,
} from '../quoteSendTemplates'

describe('quoteSendTemplates', () => {
  it('replaces firstName and legacy clientName', () => {
    expect(replaceQuoteTags('Hi {{firstName}}', { firstName: 'Ada' })).toBe('Hi Ada')
    expect(replaceQuoteTags('Hi {{clientName}}', { clientName: 'Ada Lovelace' })).toBe('Hi Ada Lovelace')
  })

  it('defaults greeting to firstName in email template', () => {
    expect(DEFAULT_QUOTE_EMAIL_TEMPLATE.body).toContain('{{firstName}}')
    expect(DEFAULT_QUOTE_EMAIL_TEMPLATE.body).not.toContain('{{clientName}}')
  })

  it('pill text uses attribute label when value missing', () => {
    expect(getQuoteTagPillText('firstName', {})).toBe('First Name')
    expect(getQuoteTagPillText('firstName', { firstName: 'Ada' })).toBe('Ada')
    expect(getQuoteTagPillText('quoteLink', { quoteLink: '' })).toBe('Quote Link')
  })

  it('round-trips mustache through editor HTML', () => {
    const src = 'Hi {{firstName}}, total {{quoteTotal}}'
    const html = mustacheToQuoteEditorHtml(src, { firstName: 'Ada', quoteTotal: 120 })
    expect(html).toContain('data-tag="firstName"')
    expect(html).toContain('Ada')
    expect(html).toContain('data-tag="quoteTotal"')

    const root = document.createElement('div')
    root.innerHTML = html
    expect(quoteEditorDomToMustache(root)).toBe(src)
  })
})
