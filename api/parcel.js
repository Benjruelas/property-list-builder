/**
 * LandRecords parcel attribute lookup (WMS GetFeatureInfo).
 * Vector tiles omit attributes in some counties; this returns the full
 * pro:parcel_us record for a map click point.
 */

import { enforceIpRateLimit } from './lib/rateLimit.js'

const WMS_BASE = 'https://api.landrecords.us/pro/wms'
const WFS_BASE = 'https://api.landrecords.us/pro/wfs'
const BBOX_DELTA = 0.00015

function authHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` }
}

async function fetchWmsByPoint(lat, lng, apiKey) {
  const minLat = lat - BBOX_DELTA
  const maxLat = lat + BBOX_DELTA
  const minLon = lng - BBOX_DELTA
  const maxLon = lng + BBOX_DELTA
  const url = new URL(WMS_BASE)
  url.searchParams.set('service', 'WMS')
  url.searchParams.set('version', '1.3.0')
  url.searchParams.set('request', 'GetFeatureInfo')
  url.searchParams.set('layers', 'pro:parcel_us')
  url.searchParams.set('query_layers', 'pro:parcel_us')
  url.searchParams.set('crs', 'EPSG:4326')
  url.searchParams.set('bbox', `${minLat},${minLon},${maxLat},${maxLon}`)
  url.searchParams.set('width', '101')
  url.searchParams.set('height', '101')
  url.searchParams.set('i', '50')
  url.searchParams.set('j', '50')
  url.searchParams.set('info_format', 'application/json')
  url.searchParams.set('feature_count', '1')

  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) return null
  const data = await res.json()
  const feature = data?.features?.[0]
  if (!feature?.properties) return null
  return feature.properties
}

async function fetchWfsByLrid(lrid, apiKey) {
  const url = new URL(WFS_BASE)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', 'pro:parcel_us')
  url.searchParams.set('cql_filter', `lrid='${lrid.replace(/'/g, "''")}'`)
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('count', '1')

  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) return null
  const data = await res.json()
  if (data?.error) return null
  const feature = data?.features?.[0]
  if (!feature?.properties) return null
  return feature.properties
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

  if (await enforceIpRateLimit(req, res, { name: 'parcel', limit: 2000, windowSec: 60 })) return

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  const lrid = typeof req.query.lrid === 'string' ? req.query.lrid.trim() : ''

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' })
  }

  const apiKey = process.env.LANDRECORDS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'LandRecords API not configured' })
  }

  try {
    let properties = null
    let source = 'wms'

    if (lrid && /^[\w-]+$/.test(lrid)) {
      properties = await fetchWfsByLrid(lrid, apiKey)
      if (properties) source = 'wfs'
    }

    if (!properties) {
      properties = await fetchWmsByPoint(lat, lng, apiKey)
      source = 'wms'
    }

    if (!properties) {
      return res.status(404).json({ error: 'parcel not found' })
    }

    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json({ properties, source })
  } catch (e) {
    console.error('parcel lookup error:', e.message)
    return res.status(502).json({ error: 'parcel lookup failed' })
  }
}
