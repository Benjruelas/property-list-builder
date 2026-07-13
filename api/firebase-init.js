/**
 * Serves /__/firebase/init.json to fix 404 that breaks Firebase auth.
 * Use with custom authDomain (your app's domain instead of firebaseapp.com).
 */

import { resolveAuthDomain } from './_lib/resolveAuthDomain.js'

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
