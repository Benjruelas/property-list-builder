/**
 * LandRecords parcel attribute lookup (WFS by lrid, then WMS GetFeatureInfo).
 * Vector tiles are a reduced MVT (`parcels`): address + values, no owner.
 * GET WFS with cql_filter looks like SQL to Cloudflare WAF, so we POST Filter XML.
 */

import { enforceIpRateLimit } from './_lib/rateLimit.js'
import { landRecordsFetch } from './_lib/landRecordsAuth.js'
import { pickParcelFeature, propertiesMatchRequestedLrid } from './_lib/parcelLookup.js'
import {
  wfsGetFeatureByLridXml,
  parseGeoJsonFeatureProperties,
  parseGeoJsonFeatures,
} from './_lib/parcelWfs.js'

const WMS_BASE = 'https://api.landrecords.us/pro/wms'
const WFS_BASE = 'https://api.landrecords.us/pro/wfs'
const BBOX_DELTA = 0.00015
const LRID_RE = /^[\w-]+$/

async function readJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
  url.searchParams.set('feature_count', '10')

  const res = await landRecordsFetch(url.toString(), { apiKey })
  if (!res.ok) return { status: res.status, features: [] }
  return { status: res.status, features: parseGeoJsonFeatures(await readJson(res)) }
}

async function fetchWfsByLrid(lrid, apiKey) {
  const post = await landRecordsFetch(WFS_BASE, {
    apiKey,
    method: 'POST',
    body: wfsGetFeatureByLridXml(lrid),
    contentType: 'application/xml',
  })
  let data = await readJson(post)
  let properties = parseGeoJsonFeatureProperties(data)
  if (properties) return { status: post.status, properties, via: 'post' }

  const url = new URL(WFS_BASE)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', 'pro:parcel_us')
  url.searchParams.set('cql_filter', `lrid='${lrid.replace(/'/g, "''")}'`)
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('count', '1')

  const get = await landRecordsFetch(url.toString(), { apiKey })
  data = await readJson(get)
  properties = parseGeoJsonFeatureProperties(data)
  return { status: get.status, properties, via: 'get' }
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
    let wfsStatus = ''
    let wmsStatus = ''

    if (lrid && LRID_RE.test(lrid)) {
      const wfs = await fetchWfsByLrid(lrid, apiKey)
      wfsStatus = String(wfs.status || '')
      if (wfs.properties) {
        properties = wfs.properties
        source = 'wfs'
      }
    }

    if (!properties) {
      const wms = await fetchWmsFeaturesByPoint(lat, lng, apiKey)
      wmsStatus = String(wms.status || '')
      const wmsFeature = pickParcelFeature(wms.features, lrid)
      properties = wmsFeature?.properties || null
      source = 'wms'
    }

    if (properties && !propertiesMatchRequestedLrid(properties, lrid)) {
      properties = null
    }

    if (wfsStatus) res.setHeader('X-Parcel-Wfs', wfsStatus)
    if (wmsStatus) res.setHeader('X-Parcel-Wms', wmsStatus)

    if (!properties) {
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
