import { describe, expect, it, vi } from 'vitest'
import {
  formatImportWait,
  isRetriableImportError,
  nextImportBatchSize,
  retryDelaySeconds,
  withImportRetry,
} from '../importRateLimit'

describe('importRateLimit helpers', () => {
  it('formats short and long waits', () => {
    expect(formatImportWait(15)).toBe('15s')
    expect(formatImportWait(90)).toBe('2 min')
    expect(formatImportWait(3700)).toBe('1h 2m')
  })

  it('prefers server retryAfter and falls back to exponential backoff', () => {
    expect(retryDelaySeconds({ retryAfter: 42 }, 3)).toBe(42)
    expect(retryDelaySeconds({}, 0)).toBe(5)
    expect(retryDelaySeconds({}, 2)).toBe(20)
  })

  it('shrinks batch size when remaining quota is lower', () => {
    expect(nextImportBatchSize(50, 12)).toBe(12)
    expect(nextImportBatchSize(50, 200)).toBe(50)
    expect(nextImportBatchSize(50, null)).toBe(50)
  })

  it('retries retriable import errors until success', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const run = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) {
        const err = new Error('limit')
        err.status = 429
        err.retryAfter = 1
        throw err
      }
      return 'ok'
    })
    const waits = []
    const promise = withImportRetry(run, {
      onRateLimitWait: (info) => waits.push(info.waitSec),
    })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1, 1])
    vi.useRealTimers()
  })

  it('does not retry non-rate-limit failures', async () => {
    const err = new Error('bad request')
    err.status = 400
    await expect(withImportRetry(async () => { throw err })).rejects.toThrow('bad request')
  })

  it('identifies retriable statuses', () => {
    expect(isRetriableImportError({ status: 429 })).toBe(true)
    expect(isRetriableImportError({ status: 503 })).toBe(true)
    expect(isRetriableImportError({ status: 400 })).toBe(false)
  })
})
