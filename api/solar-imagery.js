import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

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

function putToR2(key, body, contentType = 'application/json') {
  return getS3().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export default async function handler(req, res) {
  const { lat, lng, radius, force } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }

  const latF = parseFloat(lat)
  const lngF = parseFloat(lng)
  const radiusMeters = parseInt(radius, 10) || 30
  const skipCache = force === '1'
  const cacheKey = `solar/${latF.toFixed(6)}/${lngF.toFixed(6)}.json`

  // 1. Check R2 cache
  if (!skipCache) {
    try {
      const cached = await getFromR2(cacheKey)
      if (cached) {
        const data = JSON.parse(cached.toString('utf-8'))
        if (data.imagery_url) {
          res.setHeader('Cache-Control', 'public, max-age=86400')
          return res.status(200).json(data)
        }
      }
    } catch (e) {
      console.error('R2 cache read error:', e.message)
    }
  }

  const apiKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_SOLAR_API_KEY not configured' })
  }

  // 2. Fetch building insights
  let insights = null
  try {
    const insightsUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${latF}&location.longitude=${lngF}&requiredQuality=MEDIUM&key=${apiKey}`
    const insightsRes = await fetch(insightsUrl)
    if (insightsRes.ok) {
      insights = await insightsRes.json()
    } else {
      console.error('Building insights error:', insightsRes.status, await insightsRes.text().catch(() => ''))
    }
  } catch (e) {
    console.error('Building insights fetch error:', e.message)
  }

  // 3. Fetch data layers — try HIGH quality first, fall back to MEDIUM
  let rgbUrl = null
  let imageryDate = null
  for (const quality of ['HIGH', 'MEDIUM']) {
    try {
      const pixelSize = quality === 'HIGH' ? 0.1 : 0.25
      const layersUrl = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${latF}&location.longitude=${lngF}&radiusMeters=${radiusMeters}&view=IMAGERY_AND_ALL_FLUX_LAYERS&requiredQuality=${quality}&pixelSizeMeters=${pixelSize}&key=${apiKey}`
      const layersRes = await fetch(layersUrl)
      if (layersRes.ok) {
        const layers = await layersRes.json()
        rgbUrl = layers.rgbUrl || null
        imageryDate = layers.imageryDate || null
        if (rgbUrl) break
      }
    } catch (e) {
      console.error(`Data layers fetch error (${quality}):`, e.message)
    }
  }

  // 4. Fetch the GeoTIFF and convert to PNG via sharp
  let imageryBase64 = null
  if (rgbUrl) {
    try {
      const tiffUrl = `${rgbUrl}&key=${apiKey}`
      const imgRes = await fetch(tiffUrl)
      if (imgRes.ok) {
        const tiffBuf = Buffer.from(await imgRes.arrayBuffer())
        const pngBuf = await sharp(tiffBuf).png({ compressionLevel: 3 }).toBuffer()
        imageryBase64 = `data:image/png;base64,${pngBuf.toString('base64')}`

        putToR2(`solar/${latF.toFixed(6)}/${lngF.toFixed(6)}.png`, pngBuf, 'image/png').catch(() => {})
      } else {
        console.error('GeoTIFF fetch error:', imgRes.status)
      }
    } catch (e) {
      console.error('GeoTIFF conversion error:', e.message)
    }
  }

  // 5. Build response
  const solarPotential = insights?.solarPotential || null
  const roofSegments = solarPotential?.roofSegmentStats || []
  const result = {
    lat: latF,
    lng: lngF,
    imagery_url: imageryBase64,
    imagery_date: imageryDate,
    roof_area_sqm: solarPotential?.wholeRoofStats?.areaMeters2 ?? null,
    roof_segments: roofSegments.map(s => ({
      pitch_degrees: s.pitchDegrees,
      azimuth_degrees: s.azimuthDegrees,
      area_sqm: s.areaMeters2,
    })),
    max_panels: solarPotential?.maxArrayPanelsCount ?? null,
    max_sunshine_hours: solarPotential?.maxSunshineHoursPerYear ?? null,
    building_center: insights?.center || null,
    bounding_box: insights?.boundingBox || null,
  }

  // 6. Cache to R2
  try {
    await putToR2(cacheKey, Buffer.from(JSON.stringify(result)))
  } catch (e) {
    console.error('R2 cache write error:', e.message)
  }

  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.status(200).json(result)
}
