/**
 * Viewport WFS occupancy lookup for parcel house-number labels.
 * Nationwide vector tiles have situs but not mailing/homestead, so OO icons
 * would stay unknown without this. POST bbox Filter XML (same WAF reason as
 * single-lrid WFS).
 */

import { enforceIpRateLimit } from './_lib/rateLimit.js'
import { landRecordsFetch } from './_lib/landRecordsAuth.js'
import {
  wfsGetFeatureByBboxXml,
  parseGeoJsonFeatures,
  occupancyMapFromWfsFeatures,
} from './_lib/parcelWfs.js'

const WFS_BASE = 'https://api.landrecords.us/pro/wfs'
const MAX_COUNT = 200

function parseBound(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchWfsByBbox({ south, west, north, east, apiKey }) {
  const post = await landRecordsFetch(WFS_BASE, {
    apiKey,
    method: 'POST',
    body: wfsGetFeatureByBboxXml({ south, west, north, east, count: MAX_COUNT }),
    contentType: 'application/xml',
  })
  if (post.ok) {
    const features = parseGeoJsonFeatures(await readJson(post))
    if (features.length) return { status: post.status, features }
  }

  const url = new URL(WFS_BASE)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', 'pro:parcel_us')
  url.searchParams.set('bbox', `${west},${south},${east},${north},EPSG:4326`)
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('count', String(MAX_COUNT))
  const get = await landRecordsFetch(url.toString(), { apiKey })
  const features = get.ok ? parseGeoJsonFeatures(await readJson(get)) : []
  return { status: get.status, features }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (await enforceIpRateLimit(req, res, { name: 'parcel-bbox', limit: 400, windowSec: 60 })) return

  const west = parseBound(req.query.west)
  const south = parseBound(req.query.south)
  const east = parseBound(req.query.east)
  const north = parseBound(req.query.north)
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    return res.status(400).json({ error: 'west, south, east, north required' })
  }
  if (east - west > 0.2 || north - south > 0.2) {
    return res.status(400).json({ error: 'bbox too large' })
  }

  const apiKey = process.env.LANDRECORDS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'LandRecords API not configured' })
  }

  try {
    const { status, features } = await fetchWfsByBbox({ south, west, north, east, apiKey })
    res.setHeader('X-Parcel-Wfs', String(status || ''))
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json({ occupancy: occupancyMapFromWfsFeatures(features) })
  } catch (e) {
    console.error('parcel-bbox error:', e.message)
    return res.status(502).json({ error: 'parcel occupancy lookup failed' })
  }
}
