/** Helpers for resilient large CSV imports when API rate limits apply. */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function formatImportWait(seconds) {
  const sec = Math.max(1, Math.ceil(Number(seconds) || 1))
  if (sec < 60) return `${sec}s`
  const min = Math.ceil(sec / 60)
  if (min < 60) return `${min} min`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`
}

export function isRetriableImportError(err) {
  return err?.status === 429 || err?.status === 503
}

/** Prefer server Retry-After; fall back to short exponential backoff. */
export function retryDelaySeconds(err, attempt = 0) {
  const fromApi = Number(err?.retryAfter)
  if (Number.isFinite(fromApi) && fromApi > 0) return fromApi
  return Math.min(3600, Math.max(5, (2 ** attempt) * 5))
}

/** Shrink the next batch when the API reports limited remaining quota. */
export function nextImportBatchSize(defaultSize, rateRemaining) {
  const size = Math.max(1, Number(defaultSize) || 50)
  if (rateRemaining == null) return size
  const remaining = Number(rateRemaining)
  if (!Number.isFinite(remaining) || remaining <= 0) return size
  return Math.min(size, remaining)
}

export async function withImportRetry(run, { onRateLimitWait } = {}) {
  let attempt = 0
  while (true) {
    try {
      return await run()
    } catch (err) {
      if (!isRetriableImportError(err)) throw err
      const waitSec = retryDelaySeconds(err, attempt)
      onRateLimitWait?.({ waitSec, status: err.status, attempt: attempt + 1 })
      await sleep(waitSec * 1000)
      attempt += 1
    }
  }
}
