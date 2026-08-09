/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  persistShareClaimToken,
  peekShareClaimToken,
  clearShareClaimToken,
  resolvePendingShareClaimToken,
} from '../resourceShare'

describe('resourceShare client helpers', () => {
  beforeEach(() => {
    clearShareClaimToken()
  })

  it('persists and clears pending claim tokens in sessionStorage', () => {
    persistShareClaimToken('tok_abc1234567890')
    expect(peekShareClaimToken()).toBe('tok_abc1234567890')
    clearShareClaimToken()
    expect(peekShareClaimToken()).toBe('')
  })

  it('resolvePendingShareClaimToken falls back to sessionStorage', () => {
    persistShareClaimToken('tok_session_share_1')
    expect(resolvePendingShareClaimToken()).toBe('tok_session_share_1')
  })
})
