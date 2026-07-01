import { describe, it, expect } from 'vitest'
import {
  replaceReportTags,
  applyReportLinkToText,
  DEFAULT_REPORT_EMAIL_BODY,
  DEFAULT_REPORT_TEXT_BODY,
} from '../reportSendTemplates'

describe('reportSendTemplates', () => {
  it('replaces report tags in templates', () => {
    const out = replaceReportTags('Hi {ClientName}, {ReportLink}', {
      ClientName: 'Alex',
      ReportLink: 'https://app.test/?report=abc',
    })
    expect(out).toBe('Hi Alex, https://app.test/?report=abc')
  })

  it('applies report link to editable text', () => {
    expect(applyReportLinkToText('See {ReportLink}', 'https://app.test/?report=abc'))
      .toBe('See https://app.test/?report=abc')
    expect(applyReportLinkToText('[link will appear after send]', 'https://app.test/?report=abc'))
      .toBe('https://app.test/?report=abc')
  })

  it('keeps default templates using {ReportLink}', () => {
    expect(DEFAULT_REPORT_EMAIL_BODY).toContain('{ReportLink}')
    expect(DEFAULT_REPORT_TEXT_BODY).toContain('{ReportLink}')
  })
})
