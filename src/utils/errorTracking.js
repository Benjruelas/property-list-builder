/**
 * Optional Sentry error tracking.
 *
 * Loaded dynamically only when VITE_SENTRY_DSN is configured, so projects
 * without Sentry pay zero bundle cost. All reporting goes through
 * `reportError`, which degrades to console.error when Sentry is off.
 */

let sentry = null

export function initErrorTracking() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // Errors only by default; enable tracing via env when needed.
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE || 0),
      })
      sentry = Sentry
    })
    .catch((err) => {
      console.warn('Sentry init failed:', err?.message || err)
    })
}

export function reportError(error, context = {}) {
  if (sentry) {
    sentry.captureException(error, { extra: context })
  } else {
    console.error('App error:', error, context)
  }
}
