import { describe, it, expect } from 'vitest'
import {
  replaceReportTags,
  applyReportLinkToText,
  DEFAULT_REPORT_EMAIL_BODY,
  DEFAULT_REPORT_TEXT_BODY,
} from '../reportSendTemplates'

describe('reportSendTemplates', () => {
  it('replaces report tags in templates', () => {
    const out = replaceReportTags('Hi {{clientName}}, {{reportLink}}', {
      clientName: 'Alex',
      reportLink: 'https://app.test/r/abc',
    })
    expect(out).toBe('Hi Alex, https://app.test/r/abc')
  })

  it('applies report link to editable text', () => {
    expect(applyReportLinkToText('See {{reportLink}}', 'https://app.test/r/abc'))
      .toBe('See https://app.test/r/abc')
    expect(applyReportLinkToText('[link will appear after send]', 'https://app.test/r/abc'))
      .toBe('https://app.test/r/abc')
  })

  it('keeps default templates using {{reportLink}}', () => {
    expect(DEFAULT_REPORT_EMAIL_BODY).toContain('{{reportLink}}')
    expect(DEFAULT_REPORT_TEXT_BODY).toContain('{{reportLink}}')
  })
})
