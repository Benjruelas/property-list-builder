import { describe, it, expect } from 'vitest'
import { simplifyPasswordResetLink } from '../firebaseAdmin.js'
import { buildPasswordResetEmailHtml, getAuthFromAddress } from '../authEmail.js'

describe('simplifyPasswordResetLink', () => {
  it('builds a short knockscout reset URL', () => {
    const firebaseLink =
      'https://knockscout.app/reset-password?apiKey=abc&mode=resetPassword&oobCode=XYZ123&continueUrl=https%3A%2F%2Fknockscout.app&lang=en'
    expect(simplifyPasswordResetLink(firebaseLink, 'https://knockscout.app')).toBe(
      'https://knockscout.app/reset-password?oobCode=XYZ123'
    )
  })

  it('preserves email when present on firebase link', () => {
    const firebaseLink =
      'https://knockscout.app/reset-password?oobCode=ABC&email=user%40example.com&apiKey=x'
    expect(simplifyPasswordResetLink(firebaseLink, 'https://knockscout.app')).toBe(
      'https://knockscout.app/reset-password?oobCode=ABC&email=user%40example.com'
    )
  })
})

describe('authEmail', () => {
  it('defaults auth from address to knockscout.com', () => {
    const prev = process.env.AUTH_FROM_EMAIL
    delete process.env.AUTH_FROM_EMAIL
    delete process.env.RESEND_FROM_EMAIL
    expect(getAuthFromAddress()).toBe('KnockScout <noreply@knockscout.com>')
    if (prev) process.env.AUTH_FROM_EMAIL = prev
  })

  it('includes reset button and plain link in html', () => {
    const html = buildPasswordResetEmailHtml({
      resetLink: 'https://knockscout.app/reset-password?oobCode=test',
      recipientEmail: 'user@example.com',
    })
    expect(html).toContain('Reset password')
    expect(html).toContain('https://knockscout.app/reset-password?oobCode=test')
    expect(html).toContain('user@example.com')
  })
})

describe('parsePublicRoute reset-password', () => {
  it('detects reset password path', async () => {
    const { parsePublicRoute } = await import('../../../src/utils/publicLinks.js')
    expect(parsePublicRoute('/reset-password', '')).toEqual({ type: 'reset-password' })
    expect(parsePublicRoute('/reset-password/', '?oobCode=abc')).toEqual({ type: 'reset-password' })
  })
})
