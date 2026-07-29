import { afterEach, describe, expect, it } from 'vitest'
import {
  isNetworkFailure,
  isBrowserOffline,
  newIdempotencyKey,
} from '../offlineOutbox'

describe('offlineOutbox helpers', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
  })

  it('detects network failures', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new Error('NetworkError when attempting to fetch'))).toBe(true)
    expect(isNetworkFailure(new Error('Validation failed'))).toBe(false)
  })

  it('reads browser offline flag', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    expect(isBrowserOffline()).toBe(true)
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    expect(isBrowserOffline()).toBe(false)
  })

  it('generates idempotency keys', () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
