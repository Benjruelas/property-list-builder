/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  persistShareClaimToken,
  peekShareClaimToken,
  clearShareClaimToken,
  resolvePendingShareClaimToken,
} from '../resourceShare'

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

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
