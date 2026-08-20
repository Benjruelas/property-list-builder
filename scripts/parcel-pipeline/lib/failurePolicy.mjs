/**
 * Failure classification + retry caps so nationwide workers never spin forever
 * on the same broken county (e.g. normalize kept=0).
 *
 * Env:
 *   PARCEL_MAX_RETRIES — max attempts for transient errors (default 3)
 */

export const MAX_TRANSIENT_RETRIES = Math.max(
  1,
  Number(process.env.PARCEL_MAX_RETRIES || 3),
)

/** @param {string|undefined|null} error */
export function classifyFailure(error) {
  const e = String(error || '')
  // Permanent: retrying the same artifacts/source will not help.
  if (/normalize-county\.mjs exit 3/.test(e) || /zero features after normalization/.test(e)) {
    return { permanent: true, reason: 'normalize_kept_zero' }
  }
  if (/thin_source:/.test(e)) {
    return { permanent: true, reason: 'thin_source' }
  }
  if (/no viable source|no_source/i.test(e)) {
    return { permanent: true, reason: 'no_source' }
  }
  // Transient / environmental — allow a few retries then park.
  if (/slot lock timeout/.test(e)) {
    return { permanent: false, reason: 'slot_timeout' }
  }
  if (/tippecanoe timeout|exit 124/.test(e)) {
    return { permanent: false, reason: 'tile_timeout' }
  }
  if (/ECONNRESET|ETIMEDOUT|fetch failed|socket|503|502|429/i.test(e)) {
    return { permanent: false, reason: 'network' }
  }
  return { permanent: false, reason: 'unknown' }
}

/**
 * Decide next status after a failure.
 * @param {object|undefined} prev prior progress row
 * @param {string} error
 */
export function nextFailureDecision(prev, error) {
  const cls = classifyFailure(error)
  const failCount = (prev?.failCount || 0) + 1
  const sameErrorStreak =
    prev?.error && prev.error === error ? (prev.sameErrorStreak || 1) + 1 : 1

  // Permanent errors: park immediately (1 attempt is enough).
  // Same error twice, or total retries exhausted: park.
  const park =
    cls.permanent ||
    sameErrorStreak >= 2 ||
    failCount >= MAX_TRANSIENT_RETRIES

  if (park) {
    const why = cls.permanent
      ? `permanent (${cls.reason})`
      : sameErrorStreak >= 2
        ? `same error ×${sameErrorStreak} (${cls.reason})`
        : `${failCount}/${MAX_TRANSIENT_RETRIES} retries exhausted (${cls.reason})`
    return {
      status: 'skipped',
      failCount,
      sameErrorStreak,
      error,
      permanentFailure: true,
      failureReason: cls.reason,
      note: `parked — will not retry: ${why}`,
    }
  }

  return {
    status: 'failed',
    failCount,
    sameErrorStreak,
    error,
    permanentFailure: false,
    failureReason: cls.reason,
    note: `retryable ${failCount}/${MAX_TRANSIENT_RETRIES} (${cls.reason})`,
  }
}

/** True if a failed row must never be reclaimed. */
export function isExhaustedFailure(prev) {
  if (!prev || prev.status !== 'failed') return false
  if (prev.permanentFailure) return true
  if ((prev.failCount || 0) >= MAX_TRANSIENT_RETRIES) return true
  return classifyFailure(prev.error).permanent
}
