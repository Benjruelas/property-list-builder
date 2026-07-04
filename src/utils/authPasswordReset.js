/**
 * Request a branded password reset email from the KnockScout API.
 */

export async function requestPasswordResetEmail(email) {
  const res = await fetch('/api/auth-password-reset-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim() }),
  })

  const data = await res.json().catch(() => ({}))

  if (res.status === 429) {
    const err = new Error(data.error || 'Too many requests. Please try again later.')
    err.code = 'auth/too-many-requests'
    throw err
  }

  if (res.status === 400) {
    const err = new Error(data.error || 'Invalid email address.')
    err.code = 'auth/invalid-email'
    throw err
  }

  if (!res.ok) {
    const err = new Error(data.error || 'Failed to send password reset email.')
    err.code = 'auth/internal-error'
    throw err
  }

  return data
}
