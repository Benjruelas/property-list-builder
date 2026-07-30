import { describe, it, expect } from 'vitest'
import { leadFormStatusLabel } from '../leadForms'

describe('leadForms client utils', () => {
  it('maps status labels for display', () => {
    expect(leadFormStatusLabel('pending')).toBe('Pending')
    expect(leadFormStatusLabel('viewed')).toBe('Viewed')
    expect(leadFormStatusLabel('completed')).toBe('Completed')
    expect(leadFormStatusLabel('sent')).toBe('Sent')
  })
})
