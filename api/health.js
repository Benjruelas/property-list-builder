import { kv, kvAvailable } from './_lib/kvBootstrap.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const checks = {
    kv: false,
    timestamp: new Date().toISOString(),
  }

  if (kvAvailable && kv) {
    try {
      const probeKey = '__health_probe__'
      await kv.set(probeKey, '1', { ex: 30 })
      const val = await kv.get(probeKey)
      checks.kv = val === '1' || val === 1
    } catch (e) {
      checks.kvError = e.message
    }
  } else {
    checks.kv = process.env.NODE_ENV !== 'production'
    checks.kvNote = 'no_kv_configured'
  }

  const ok = checks.kv
  res.setHeader('Cache-Control', 'no-store')
  return res.status(ok ? 200 : 503).json({ ok, checks })
}
