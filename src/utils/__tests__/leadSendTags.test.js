import { describe, it, expect } from 'vitest'
import {
  customFieldDefsToSendTags,
  buildCustomFieldTagData,
  withLeadFieldTags,
  withLeadFieldTagData,
  passThroughLeadFieldValues,
} from '../leadSendTags'
import { replaceQuoteTags } from '../quoteSendTemplates'
import { replaceFormSendTags, replaceReportSendTags } from '../sendTemplateTags'
import { resolveOutreachTemplateText, OUTREACH_SEND_TAGS } from '../emailTemplates'
import { QUOTE_SEND_TAGS } from '../quoteSendTemplates'
import { FORM_SEND_TAGS, REPORT_SEND_TAGS } from '../sendTemplateTags'

const DEFS = [
  { id: 'roof_age', label: 'Roof age', type: 'text' },
  { id: 'tier', label: 'Tier', type: 'select', options: ['A', 'B'] },
]

describe('leadSendTags', () => {
  it('maps custom field defs to cf_ tags', () => {
    expect(customFieldDefsToSendTags(DEFS)).toEqual([
      { key: 'cf_roof_age', label: 'Roof age', tag: '{{cf_roof_age}}' },
      { key: 'cf_tier', label: 'Tier', tag: '{{cf_tier}}' },
    ])
  })

  it('builds custom field tag data from lead values', () => {
    expect(buildCustomFieldTagData({
      customFields: { roof_age: '12', tier: 'A' },
    }, DEFS)).toEqual({
      cf_roof_age: '12',
      cf_tier: 'A',
    })
  })

  it('merges email/phone and custom fields onto base tags', () => {
    const tags = withLeadFieldTags(QUOTE_SEND_TAGS, DEFS)
    expect(tags.some((t) => t.key === 'email')).toBe(true)
    expect(tags.some((t) => t.key === 'phone')).toBe(true)
    expect(tags.some((t) => t.key === 'cf_roof_age')).toBe(true)
    expect(tags.some((t) => t.key === 'firstName')).toBe(true)
  })

  it('passes custom fields through quote/form/report resolvers', () => {
    const data = {
      firstName: 'Sam',
      cf_roof_age: '12',
      email: 'sam@example.com',
    }
    expect(replaceQuoteTags('Age {{cf_roof_age}} / {{email}}', data)).toBe('Age 12 / sam@example.com')
    expect(replaceFormSendTags('Hi {{firstName}} {{cf_roof_age}}', data)).toBe('Hi Sam 12')
    expect(replaceReportSendTags('{{email}} {{cf_roof_age}}', data)).toBe('sam@example.com 12')
  })

  it('resolves outreach templates with custom fields left as mustache', () => {
    const parcel = {
      firstName: 'Alex',
      lead: {
        firstName: 'Alex',
        customFields: { roof_age: '8', tier: 'B' },
        emailDetails: [{ value: 'alex@ex.com', primary: true }],
        phoneDetails: [{ value: '5125551212', primary: true }],
      },
    }
    const out = resolveOutreachTemplateText(
      'Hi {First Name}, roof {{cf_roof_age}}, email {{email}}',
      parcel,
      DEFS,
    )
    expect(out).toBe('Hi Alex, roof 8, email alex@ex.com')
  })

  it('withLeadFieldTagData fills empty custom labels for pills', () => {
    const data = withLeadFieldTagData({ firstName: '' }, null, DEFS)
    expect(data.cf_roof_age).toBe('')
    expect(data.email).toBe('')
  })

  it('passThroughLeadFieldValues overlays extras onto built maps', () => {
    expect(passThroughLeadFieldValues({ firstName: 'A' }, { cf_tier: 'B', phone: '1' })).toEqual({
      firstName: 'A',
      cf_tier: 'B',
      phone: '1',
    })
  })

  it('outreach base tags include core fields and merge without duplicates', () => {
    const tags = withLeadFieldTags(OUTREACH_SEND_TAGS, DEFS)
    const keys = tags.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('address')
    expect(keys).toContain('cf_tier')
    expect(FORM_SEND_TAGS.length).toBeGreaterThan(0)
    expect(REPORT_SEND_TAGS.length).toBeGreaterThan(0)
  })
})
