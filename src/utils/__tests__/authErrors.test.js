import { describe, expect, it } from 'vitest'
import { formatAuthError, isAuthNetworkError } from '../authErrors'

describe('authErrors', () => {
  it('detects Firebase network-request-failed', () => {
    expect(isAuthNetworkError({ code: 'auth/network-request-failed' })).toBe(true)
  })

  it('detects browser fetch failures', () => {
    expect(isAuthNetworkError({ message: 'Failed to fetch' })).toBe(true)
  })

  it('formats network errors with a VPN/DNS hint', () => {
    const msg = formatAuthError({ code: 'auth/network-request-failed' })
    expect(msg).toMatch(/VPN|Private DNS/i)
  })

  it('maps invalid credentials to a generic sign-in failure', () => {
    expect(formatAuthError({ code: 'auth/invalid-credential' })).toBe('Incorrect email or password')
  })

  it('returns empty string for cancelled popup flows', () => {
    expect(formatAuthError({ code: 'auth/popup-closed-by-user' })).toBe('')
  })
})
