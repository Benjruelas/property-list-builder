/**
 * Map Firebase Auth (and network) errors to user-facing copy.
 */

const NETWORK_HINT =
  'Network error — check your connection. If you use a VPN or Private DNS, turn it off, then force-quit and reopen the app.'

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAuthNetworkError(error) {
  const code = error?.code || ''
  if (code === 'auth/network-request-failed') return true
  const msg = String(error?.message || '')
  return /failed to fetch|networkerror|load failed|network request failed|offline/i.test(msg)
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatAuthError(error, fallback = 'Something went wrong') {
  if (isAuthNetworkError(error)) return NETWORK_HINT

  const code = error?.code || ''
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered'
    case 'auth/invalid-email':
      return 'Invalid email address'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password'
    case 'auth/too-many-requests':
      return error?.message || 'Too many attempts. Try again later.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. Contact support.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    default:
      break
  }

  return error?.message || fallback
}
