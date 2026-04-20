/**
 * Localhost-only dev bypass tokens → synthetic users (must stay aligned with src/utils/devPersona.js).
 */

export const DEV_BYPASS_USER_A = { uid: 'dev-local', email: 'dev@localhost' }
export const DEV_BYPASS_USER_B = { uid: 'dev-local-2', email: 'dev2@localhost' }

const TOKEN_TO_USER = {
  'dev-bypass': DEV_BYPASS_USER_A,
  'dev-bypass-2': DEV_BYPASS_USER_B,
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
