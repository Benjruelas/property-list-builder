/**
 * Localhost-only dev bypass tokens → synthetic users (must stay aligned with src/utils/devPersona.js).
 */

export const DEV_BYPASS_USER_A = { uid: 'dev-local', email: 'dev@localhost' }
export const DEV_BYPASS_USER_B = { uid: 'dev-local-2', email: 'dev2@localhost' }

const TOKEN_TO_USER = {
  'dev-bypass': DEV_BYPASS_USER_A,
  'dev-bypass-2': DEV_BYPASS_USER_B,
}

/** @returns {string} */
function hostnameFromHostHeader(host = '') {
  const h = String(host).trim().toLowerCase()
  if (!h) return ''
  try {
    return new URL(`http://${h}`).hostname
  } catch {
    return h.split(':')[0]
  }
}

/** @returns {string} */
function hostnameFromOrigin(origin = '') {
  const o = String(origin).trim().toLowerCase()
  if (!o) return ''
  try {
    return new URL(o).hostname
  } catch {
    return ''
  }
}

/** RFC1918 private LAN — phone testing against a Mac/PC dev server on the same Wi‑Fi. */
function isPrivateLanHostname(hostname = '') {
  const h = String(hostname).toLowerCase()
  if (!h) return false
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  return false
}

/**
 * Whether synthetic dev-bypass tokens may be used for this request.
 * Matches localhost, loopback, private LAN IPs (phone → Mac dev), or ENABLE_DEV_BYPASS.
 */
export function isDevBypassAllowed(req) {
  if (process.env.ENABLE_DEV_BYPASS === 'true') return true
  const hostRaw = req?.headers?.host || req?.headers?.['x-forwarded-host'] || ''
  const originRaw = req?.headers?.origin || ''
  const combined = `${hostRaw} ${originRaw}`.toLowerCase()
  if (/localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(combined)) return true
  const hostName = hostnameFromHostHeader(hostRaw)
  const originHost = hostnameFromOrigin(originRaw)
  return isPrivateLanHostname(hostName) || isPrivateLanHostname(originHost)
}

/** @returns {{ uid: string, email: string } | null} */
export function resolveDevBypassUser(idToken) {
  if (!idToken || typeof idToken !== 'string') return null
  return TOKEN_TO_USER[idToken] || null
}

export function isDevBypassToken(idToken) {
  return !!(idToken && TOKEN_TO_USER[idToken])
}

/** Both synthetic emails (for share validation in dev). */
export const DEV_BYPASS_KNOWN_EMAILS = [
  DEV_BYPASS_USER_A.email,
  DEV_BYPASS_USER_B.email,
]
