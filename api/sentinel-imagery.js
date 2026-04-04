import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

let _s3
function getS3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

async function getFromR2(key) {
  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
    const age = Date.now() - (res.LastModified?.getTime() ?? 0)
    if (age > CACHE_TTL_MS) return null
    const chunks = []
    for await (const chunk of res.Body) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null
    throw e
  }
}

function putToR2(key, body, contentType = 'image/jpeg') {
  return getS3().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

async function fetchWaybackVersions() {
  const res = await fetch('https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json')
  if (!res.ok) throw new Error(`Wayback metadata: ${res.status}`)
  const data = await res.json()
  const selection = data.Selection || []

  const byYear = {}
  for (const s of selection) {
    const match = s.Name?.match(/Wayback (\d{4})-(\d{2})-(\d{2})/)
    if (!match) continue
    const year = parseInt(match[1], 10)
    const date = `${match[1]}-${match[2]}-${match[3]}`
    if (!byYear[year] || date < byYear[year].date) {
      byYear[year] = { year, date, m: s.M }
    }
  }
  return byYear
}

function latLngToTile(lat, lng, zoom) {
  const n = 2 ** zoom
  const xFloat = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  return { x: Math.floor(xFloat), y: Math.floor(yFloat), xFrac: xFloat % 1, yFrac: yFloat % 1 }
}

async function fetchTileWithEtag(m, z, y, x) {
  const url = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${m}/${z}/${y}/${x}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) return { buf: null, etag: null }
  const etag = res.headers.get('etag') || null
  const buf = Buffer.from(await res.arrayBuffer())
  return { buf, etag }
}

async function compositeRoofImage(m, lat, lng, zoom) {
  const center = latLngToTile(lat, lng, zoom)
  const tileSize = 256
  const gridSize = 3

  // Fetch center tile first to get its etag for dedup
  const centerResult = await fetchTileWithEtag(m, zoom, center.y, center.x)
  if (!centerResult.buf) return { imgBuf: null, etag: null }

  // Fetch surrounding tiles in parallel
  const positions = []
  const promises = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      positions.push({ dx, dy })
      promises.push(
        fetchTileWithEtag(m, zoom, center.y + dy, center.x + dx)
          .then(r => r.buf)
          .catch(() => null)
      )
    }
  }

  const surrounding = await Promise.all(promises)

  const composites = [{
    input: centerResult.buf,
    left: tileSize,
    top: tileSize,
  }]
  for (let i = 0; i < positions.length; i++) {
    if (!surrounding[i]) continue
    composites.push({
      input: surrounding[i],
      left: (positions[i].dx + 1) * tileSize,
      top: (positions[i].dy + 1) * tileSize,
    })
  }

  // Calculate exact pixel position of the property within the 3x3 grid
  const fullSize = tileSize * gridSize
  const propertyPixelX = Math.round(tileSize + center.xFrac * tileSize)
  const propertyPixelY = Math.round(tileSize + center.yFrac * tileSize)

  // Crop centered on the property, clamped to stay within bounds
  const cropSize = 420
  const halfCrop = Math.floor(cropSize / 2)
  const cropLeft = Math.max(0, Math.min(fullSize - cropSize, propertyPixelX - halfCrop))
  const cropTop = Math.max(0, Math.min(fullSize - cropSize, propertyPixelY - halfCrop))

  // Step 1: Composite all tiles onto the full canvas
  const fullBuf = await sharp({
    create: { width: fullSize, height: fullSize, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer()

  // Step 2: Crop centered on property + overlay crosshair marker
  const markerX = propertyPixelX - cropLeft
  const markerY = propertyPixelY - cropTop
  const crosshairSvg = Buffer.from(`<svg width="${cropSize}" height="${cropSize}">
    <circle cx="${markerX}" cy="${markerY}" r="14" fill="none" stroke="#ff3333" stroke-width="2.5" opacity="0.9"/>
    <circle cx="${markerX}" cy="${markerY}" r="3" fill="#ff3333" opacity="0.9"/>
  </svg>`)

  const imgBuf = await sharp(fullBuf)
    .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
    .composite([{ input: crosshairSvg, left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer()

  return { imgBuf, etag: centerResult.etag }
}

export default async function handler(req, res) {
  const { lat, lng, from_year, to_year } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }

  const latF = parseFloat(lat)
  const lngF = parseFloat(lng)
  const zoom = 19
  const startYear = parseInt(from_year, 10) || 2014
  const currentYear = new Date().getFullYear()
  const endYear = Math.min(parseInt(to_year, 10) || currentYear, currentYear)

  let versions
  try {
    versions = await fetchWaybackVersions()
  } catch (e) {
    console.error('Wayback versions error:', e.message)
    return res.status(502).json({ error: 'Could not fetch imagery versions' })
  }

  const images = []
  let lastEtag = null

  for (let year = startYear; year <= endYear; year++) {
    const version = versions[year]
    if (!version) continue

    const cacheKey = `wayback/${latF.toFixed(5)}/${lngF.toFixed(5)}/z${zoom}/${year}.json`

    // Check R2 cache (stores both image and etag)
    let imgBuf = null
    let etag = null
    try {
      const cached = await getFromR2(cacheKey)
      if (cached) {
        const meta = JSON.parse(cached.toString('utf-8'))
        etag = meta.etag
        if (meta.img) {
          imgBuf = Buffer.from(meta.img, 'base64')
        }
      }
    } catch {
      // fall through
    }

    if (!imgBuf) {
      try {
        const result = await compositeRoofImage(version.m, latF, lngF, zoom)
        imgBuf = result.imgBuf
        etag = result.etag

        if (imgBuf && imgBuf.length > 500) {
          const cacheData = JSON.stringify({ etag, img: imgBuf.toString('base64') })
          putToR2(cacheKey, Buffer.from(cacheData), 'application/json').catch(() => {})
        }
      } catch (e) {
        console.error(`Wayback composite error for ${year}:`, e.message)
      }
    }

    if (!imgBuf || imgBuf.length <= 500) continue

    // Deduplicate: skip if center tile etag matches previous year
    if (etag && etag === lastEtag) continue
    lastEtag = etag

    images.push({
      year,
      date: version.date,
      image_base64: `data:image/jpeg;base64,${imgBuf.toString('base64')}`,
    })
  }

  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.status(200).json({ lat: latF, lng: lngF, images })
}
