/**
 * Proxies Firebase Auth handler when using custom auth domain.
 * Requires VITE_FIREBASE_PROJECT_ID in env.
 */

export default async function handler(req, res) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    return res.status(500).json({ error: 'Auth proxy misconfigured' })
  }

  const path = req.query.path || 'handler'
  const firebaseUrl = `https://${projectId}.firebaseapp.com/__/auth/${path}`
  const url = new URL(firebaseUrl)
  Object.entries(req.query).forEach(([k, v]) => {
    if (k !== 'path' && v) url.searchParams.set(k, Array.isArray(v) ? v[0] : v)
  })

  try {
    const headers = { ...req.headers }
    delete headers.host
    delete headers.connection

    const fetchRes = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    })

    res.status(fetchRes.status)
    fetchRes.headers.forEach((v, k) => {
      if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v)
    })
    const body = await fetchRes.text()
    res.send(body)
  } catch (err) {
    console.error('Firebase auth proxy error:', err)
    res.status(502).json({ error: 'Auth proxy failed' })
  }
}
