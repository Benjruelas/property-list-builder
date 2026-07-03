/**
 * Serves /__/firebase/init.json to fix 404 that breaks Firebase auth.
 * Use with custom authDomain (your app's domain instead of firebaseapp.com).
 */

function resolveAuthDomain(req) {
  const fromEnv = (process.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim()
  if (fromEnv) return fromEnv.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  return String(host).split(':')[0]
}

export default function handler(req, res) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || ''
  const authDomain = resolveAuthDomain(req)

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    apiKey,
    authDomain
  })
}
