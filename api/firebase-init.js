/**
 * Serves /__/firebase/init.json to fix 404 that breaks Firebase auth.
 * Use with custom authDomain (your app's domain instead of firebaseapp.com).
 */

export default function handler(req, res) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || ''
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const authDomain = host

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    apiKey,
    authDomain
  })
}
