import { describe, it, expect } from 'vitest'
import {
  migrateLegacyReportTemplateText,
  replaceMustacheTags,
  replaceReportSendTags,
} from '../sendTemplateTags'

describe('sendTemplateTags', () => {
  it('replaces mustache tags', () => {
    expect(replaceMustacheTags('Hi {{clientName}}', { clientName: 'Sam' })).toBe('Hi Sam')
  })

  it('migrates legacy report braces', () => {
    expect(migrateLegacyReportTemplateText('Hi {ClientName}, {ReportLink}')).toBe(
      'Hi {{clientName}}, {{reportLink}}',
    )
  })

  it('replaceReportSendTags accepts legacy data keys', () => {
    const out = replaceReportSendTags('Hi {{clientName}}, {{reportLink}}', {
      ClientName: 'Alex',
      ReportLink: 'https://example.com/r/1',
    })
    expect(out).toBe('Hi Alex, https://example.com/r/1')
  })
})
