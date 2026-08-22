/**
 * LandRecords parcel attribute lookup (WFS by lrid, then WMS GetFeatureInfo).
 * The reduced `parcels` MVT layer often has geometry without situs; WMS at a
 * click point can return an overlapping school/city polygon instead. When the
 * client sends `lrid`, only that record is returned.
 */

import { enforceIpRateLimit } from './_lib/rateLimit.js'
import { landRecordsAuthHeaders } from './_lib/landRecordsAuth.js'
import { pickParcelFeature, propertiesMatchRequestedLrid } from './_lib/parcelLookup.js'

const WMS_BASE = 'https://api.landrecords.us/pro/wms'
const WFS_BASE = 'https://api.landrecords.us/pro/wfs'
const BBOX_DELTA = 0.00015

function authHeaders(apiKey) {
  return landRecordsAuthHeaders(apiKey)
}

async function fetchWmsFeaturesByPoint(lat, lng, apiKey) {
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
  // Overlapping school/city polygons are common; callers pick by lrid or smallest area.
  url.searchParams.set('feature_count', '10')

  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data?.features) ? data.features : []
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
      const wmsFeature = pickParcelFeature(await fetchWmsFeaturesByPoint(lat, lng, apiKey), lrid)
      properties = wmsFeature?.properties || null
      source = 'wms'
    }

    if (properties && !propertiesMatchRequestedLrid(properties, lrid)) {
      properties = null
    }

    if (!properties) {
      // Expected when WFS/WMS lag vector tiles — 200 keeps the browser console quiet.
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.status(200).json({ properties: null, source: 'none' })
    }

    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json({ properties, source })
  } catch (e) {
    console.error('parcel lookup error:', e.message)
    return res.status(502).json({ error: 'parcel lookup failed' })
  }
}
