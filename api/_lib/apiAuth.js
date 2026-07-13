/**
 * Small helper to require an authenticated user on an API route.
 * Sends a 401 and returns null when authentication fails.
 */
import { authenticate } from './auth.js'

export async function requireAuth(req, res) {
  const { user } = await authenticate(req)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
    return null
  }
  return user
}

export default requireAuth
