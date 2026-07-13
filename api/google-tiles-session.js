import { enforceIpRateLimit } from './lib/rateLimit.js'

/** @type {Record<string, { session: string, expiry: number }>} */
const sessionCache = {}

const VALID_MAP_TYPES = new Set(['satellite', 'street', 'hybrid'])

function googleSessionBody(mapType) {
  const base = {
    language: 'en-US',
    region: 'US',
    scale: 'scaleFactor2x',
    highDpi: true,
  }
  if (mapType === 'street') {
    return { ...base, mapType: 'roadmap' }
  }
  // Hybrid uses satellite imagery; CARTO voyager_only_labels overlay is added client-side.
  if (mapType === 'hybrid' || mapType === 'satellite') {
    return { ...base, mapType: 'satellite' }
  }
  return { ...base, mapType: 'roadmap' }
}

function tileUrlForSession(session) {
  return `/api/google-tiles-proxy?z={z}&x={x}&y={y}&session=${encodeURIComponent(session)}`
}

function clientFallbackResponse(res, mapType) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    useClientFallback: true,
    mapType,
    provider: 'mapbox',
  })
}

async function createGoogleSession(key, mapType) {
  const resp = await fetch(`https://tile.googleapis.com/v1/createSession?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleSessionBody(mapType)),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    console.error('Google Map Tiles session error:', resp.status, errText)
    return null
  }
  return resp.json()
}

export default async function handler(req, res) {
  if (await enforceIpRateLimit(req, res, { name: 'google-tiles-session', limit: 600, windowSec: 3600 })) return

  const key = process.env.GOOGLE_MAPS_TILES_KEY || process.env.GOOGLE_SOLAR_API_KEY
  if (!key) {
    return clientFallbackResponse(res, req.query.mapType || 'satellite')
  }

  const rawType = req.query.mapType || 'satellite'
  const mapType = VALID_MAP_TYPES.has(rawType) ? rawType : 'satellite'

  const cached = sessionCache[mapType]
  if (cached && Date.now() < cached.expiry - 60_000) {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({
      tileUrl: tileUrlForSession(cached.session),
      expiry: cached.expiry,
      provider: 'google',
      mapType,
    })
  }

  try {
    let data = await createGoogleSession(key, mapType)
    if (!data) {
      await new Promise((resolve) => { setTimeout(resolve, 400) })
      data = await createGoogleSession(key, mapType)
    }

    if (!data) {
      if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=300')
        return res.status(200).json({
          tileUrl: tileUrlForSession(cached.session),
          expiry: cached.expiry,
          provider: 'google',
          mapType,
          stale: true,
        })
      }
      return clientFallbackResponse(res, mapType)
    }

    const expiry = new Date(data.expiry).getTime()
    sessionCache[mapType] = { session: data.session, expiry }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({
      tileUrl: tileUrlForSession(data.session),
      expiry,
      provider: 'google',
      mapType,
    })
  } catch (e) {
    console.error('Google Map Tiles session error:', e)
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=300')
      return res.status(200).json({
        tileUrl: tileUrlForSession(cached.session),
        expiry: cached.expiry,
        provider: 'google',
        mapType,
        stale: true,
      })
    }
    return clientFallbackResponse(res, mapType)
  }
}
