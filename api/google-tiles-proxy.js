import { enforceIpRateLimit } from './lib/rateLimit.js'

const VALID_MAP_TYPES = new Set(['satellite', 'street', 'hybrid'])
const TILE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'

function googleTilesKey() {
  return process.env.GOOGLE_MAPS_TILES_KEY || process.env.GOOGLE_SOLAR_API_KEY || ''
}

export default async function handler(req, res) {
  if (await enforceIpRateLimit(req, res, { name: 'google-tiles-proxy', limit: 4000, windowSec: 60 })) return

  const key = googleTilesKey()
  if (!key) {
    return res.status(503).json({ error: 'Google tiles not configured' })
  }

  const { z, x, y, session } = req.query || {}
  if (!z || !x || !y || !session) {
    return res.status(400).json({ error: 'z, x, y, and session are required' })
  }

  const zi = parseInt(z, 10)
  const xi = parseInt(x, 10)
  const yi = parseInt(y, 10)
  if (!Number.isFinite(zi) || !Number.isFinite(xi) || !Number.isFinite(yi)) {
    return res.status(400).json({ error: 'Invalid tile coordinates' })
  }
  if (zi < 0 || zi > 22 || xi < 0 || yi < 0) {
    return res.status(400).json({ error: 'Tile coordinates out of range' })
  }

  const sessionToken = String(session).trim().slice(0, 512)
  if (!sessionToken) {
    return res.status(400).json({ error: 'Invalid session' })
  }

  const mapType = VALID_MAP_TYPES.has(req.query.mapType) ? req.query.mapType : 'satellite'
  void mapType

  try {
    const url = `https://tile.googleapis.com/v1/2dtiles/${zi}/${xi}/${yi}?session=${encodeURIComponent(sessionToken)}&key=${encodeURIComponent(key)}`
    const upstream = await fetch(url)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      console.error('Google tile proxy error:', upstream.status, text.slice(0, 200))
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Tile fetch failed' })
    }

    const contentType = upstream.headers.get('content-type') || 'image/png'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', TILE_CACHE_CONTROL)
    return res.status(200).send(buf)
  } catch (err) {
    console.error('google-tiles-proxy error', err)
    return res.status(502).json({ error: 'Tile proxy failed' })
  }
}
