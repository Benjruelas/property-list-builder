const SANDBOX_BASE = 'https://sandbox.apis.eagleview.com'
const PROD_BASE = 'https://apis.eagleview.com'

const TILE_PATH = '/imagery/wmts/v2/visual/tile/Latest/default/GoogleMapsCompatible_9-23'
const TILE_PARAMS = 'datum=epsg%3A1383&epoch=2025.0&aggregation_preference=all'

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y }
}

export default async function handler(req, res) {
  const { lat, lng, zoom: zoomParam } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }

  const apiKey = process.env.EAGLEVIEW_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'EAGLEVIEW_API_KEY not configured' })
  }

  const latF = parseFloat(lat)
  const lngF = parseFloat(lng)
  if (isNaN(latF) || isNaN(lngF)) {
    return res.status(400).json({ error: 'Invalid lat/lng' })
  }

  const zoom = Math.min(23, Math.max(9, parseInt(zoomParam) || 20))
  const isSandbox = (process.env.EAGLEVIEW_USE_SANDBOX || '').trim() === '1'
  const baseUrl = isSandbox ? SANDBOX_BASE : PROD_BASE
  const referer = process.env.EAGLEVIEW_REFERER || 'https://knockscout.app/'

  const headers = {
    'x-api-key': apiKey.trim(),
    'Referer': referer.trim(),
    'Accept': 'image/jpeg',
  }

  const center = latLngToTile(latF, lngF, zoom)

  const grid = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      grid.push({ x: center.x + dx, y: center.y + dy, dx, dy })
    }
  }

  try {
    const results = await Promise.allSettled(
      grid.map(async (tile) => {
        const url = `${baseUrl}${TILE_PATH}/${zoom}/${tile.x}/${tile.y}.jpeg?${TILE_PARAMS}`
        const resp = await fetch(url, { headers })
        if (!resp.ok) return null
        const ct = resp.headers.get('content-type') || 'image/jpeg'
        if (!ct.startsWith('image/')) return null
        const buf = Buffer.from(await resp.arrayBuffer())
        return {
          dx: tile.dx,
          dy: tile.dy,
          x: tile.x,
          y: tile.y,
          image_base64: `data:${ct};base64,${buf.toString('base64')}`,
        }
      })
    )

    const tiles = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)

    if (tiles.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.status(200).json({
        lat: latF, lng: lngF, zoom, tiles: [],
        message: 'No EagleView imagery available at this location',
      })
    }

    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(200).json({
      lat: latF,
      lng: lngF,
      zoom,
      tileSize: 256,
      gridSize: 3,
      tiles,
    })
  } catch (e) {
    console.error('EagleView WMTS error:', e.message)
    return res.status(500).json({ error: 'EagleView API request failed', detail: e.message })
  }
}
