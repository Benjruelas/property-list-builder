const FIREBASE_HOST = /\.firebaseapp\.com$/i

function normalizeHost(value) {
  return String(value || '')
    .split(',')[0]
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
}

/** Prefer the app host over *.firebaseapp.com so OAuth iframes never expose Firebase URLs. */
export function resolveAuthDomain(req) {
  const host = normalizeHost(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost:3000')
  const fromEnv = normalizeHost(process.env.VITE_FIREBASE_AUTH_DOMAIN || '')
  if (!fromEnv || FIREBASE_HOST.test(fromEnv)) return host
  return fromEnv
}

export function resolveAuthDomainFromHost(host, envValue) {
  const normalizedHost = normalizeHost(host)
  const fromEnv = normalizeHost(envValue || '')
  if (!fromEnv || FIREBASE_HOST.test(fromEnv)) return normalizedHost
  return fromEnv
}
