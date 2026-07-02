import { describe, it, expect } from 'vitest'
import { normalizeLeadContactsForStorage } from '../leadContact.js'

describe('normalizeLeadContactsForStorage (server)', () => {
  const existing = {
    phone: '(555) 111-2222',
    email: 'jane@example.com',
    phoneDetails: [{ value: '(555) 111-2222', source: 'user', callerId: '', primary: true }],
    emailDetails: [{ value: 'jane@example.com', source: 'user', callerId: '', primary: true }],
  }

  it('preserves existing contacts when a partial update omits contact fields', () => {
    const contact = normalizeLeadContactsForStorage({ status: 'qualified' }, existing)
    expect(contact.phone).toBe('(555) 111-2222')
    expect(contact.email).toBe('jane@example.com')
    expect(contact.phoneDetails).toHaveLength(1)
    expect(contact.emailDetails).toHaveLength(1)
  })
})
