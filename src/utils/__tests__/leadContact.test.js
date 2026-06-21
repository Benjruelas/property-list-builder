import { describe, it, expect } from 'vitest'
import {
  getLeadPhones,
  getLeadEmails,
  getLeadPhoneDetails,
  normalizeLeadContactsForStorage,
  leadContactMatchesQuery,
  phoneDetailsForLeadForm,
  mergeLeadContactsWithSkipTrace,
  normalizePhoneDetail,
  normalizeEmailDetail,
  normalizePhoneKey,
  normalizeEmailKey,
  CONTACT_SOURCE_SKIPTRACE,
  CONTACT_SOURCE_USER,
  skipTraceContactDetails,
} from '../leadContact'
import { mergeSkipTraceIntoLead } from '../leadSkipTraceSync'

describe('leadContact', () => {
  it('reads legacy single phone/email', () => {
    expect(getLeadPhones({ phone: '(555) 111-2222' })).toEqual(['(555) 111-2222'])
    expect(getLeadEmails({ email: 'a@example.com' })).toEqual(['a@example.com'])
  })

  it('prefers phones/emails arrays when present', () => {
    const lead = {
      phone: '(555) 111-2222',
      phones: ['(555) 333-4444', '(555) 555-6666'],
      email: 'old@example.com',
      emails: ['new@example.com'],
    }
    expect(getLeadPhones(lead)).toEqual(['(555) 333-4444', '(555) 555-6666'])
    expect(getLeadEmails(lead)).toEqual(['new@example.com'])
  })

  it('dedupes normalized phones and emails', () => {
    const result = normalizeLeadContactsForStorage({
      phones: ['5551112222', '(555) 111-2222', ''],
      emails: ['A@Example.com', 'a@example.com'],
    })
    expect(result.phones).toEqual(['(555) 111-2222'])
    expect(result.emails).toEqual(['A@Example.com'])
  })

  it('matches search across all contacts', () => {
    const lead = {
      phones: ['(555) 111-2222'],
      emails: ['owner@example.com', 'assistant@example.com'],
    }
    expect(leadContactMatchesQuery(lead, 'assistant')).toBe(true)
    expect(leadContactMatchesQuery(lead, '111')).toBe(true)
    expect(leadContactMatchesQuery(lead, 'missing')).toBe(false)
  })

  it('builds form lists with at least one empty row', () => {
    expect(phoneDetailsForLeadForm({})).toEqual([{ value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false }])
  })

  it('marks skip trace contacts with source', () => {
    const contact = skipTraceContactDetails({
      phoneNumbers: ['5551112222'],
      emails: ['owner@example.com'],
    })
    expect(contact.phoneDetails[0].source).toBe(CONTACT_SOURCE_SKIPTRACE)
    expect(contact.emailDetails[0].source).toBe(CONTACT_SOURCE_SKIPTRACE)
  })

  it('does not duplicate user contacts when merging skip trace', () => {
    const lead = {
      phoneDetails: [{ value: '(555) 111-2222', source: CONTACT_SOURCE_USER, callerId: '', primary: true }],
      emailDetails: [],
    }
    const merged = mergeSkipTraceIntoLead(lead, {
      phoneNumbers: ['5551112222', '5553334444'],
      emails: ['owner@example.com'],
    })
    expect(merged.patch.phones).toEqual(['(555) 111-2222', '(555) 333-4444'])
    expect(getLeadPhoneDetails({ ...lead, ...merged.patch }).filter((d) => d.source === CONTACT_SOURCE_USER)).toHaveLength(1)
    expect(getLeadPhoneDetails({ ...lead, ...merged.patch }).filter((d) => d.source === CONTACT_SOURCE_SKIPTRACE)).toHaveLength(1)
  })

  it('keeps user contact when skip trace returns the same value', () => {
    const merged = mergeLeadContactsWithSkipTrace(
      [{ value: '(555) 111-2222', source: CONTACT_SOURCE_USER, callerId: '', primary: true }],
      [{ value: '(555) 111-2222', source: CONTACT_SOURCE_SKIPTRACE, callerId: 'Owner', primary: false }],
      { normalizeKey: normalizePhoneKey, normalizeDetail: normalizePhoneDetail },
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe(CONTACT_SOURCE_USER)
  })
})
