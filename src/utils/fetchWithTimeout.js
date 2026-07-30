/**
 * fetch() with an AbortController timeout.
 * Timed-out / aborted requests throw DOMException AbortError (same as user abort).
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit & { timeoutMs?: number }} [init]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(input, init = {}) {
  const { timeoutMs = 10_000, signal: outerSignal, ...rest } = init
  const controller = new AbortController()
  let timedOut = false

  const onOuterAbort = () => controller.abort(outerSignal?.reason)
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort(outerSignal.reason)
    } else {
      outerSignal.addEventListener('abort', onOuterAbort, { once: true })
    }
  }

  const timer = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    : null

  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`)
      timeoutErr.name = 'TimeoutError'
      timeoutErr.cause = err
      throw timeoutErr
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
  }
}
