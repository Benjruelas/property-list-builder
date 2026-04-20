import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000
const SPC_HAIL_URL = 'https://www.spc.noaa.gov/wcm/data/1955-2024_hail.csv.zip'
const SPC_COMPILED_MAX_YEAR = 2024

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

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function gridKey(lat, lng) {
  return `${Math.floor(lat)}/${Math.floor(lng)}`
}

function parseSpcCsv(csvText) {
  const lines = csvText.split('\n')
  const grid = {}

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 17) continue

    const year = parseInt(cols[1], 10)
    if (year < 2000) continue

    const date = cols[4]?.trim()
    const mag = parseFloat(cols[10])
    const lat = parseFloat(cols[15])
    const lng = parseFloat(cols[16])
    if (isNaN(lat) || isNaN(lng) || lat === 0) continue

    const key = gridKey(lat, lng)
    if (!grid[key]) grid[key] = []
    grid[key].push({ date, year, lat, lng, size_inches: isNaN(mag) ? null : mag })
  }

  return grid
}

async function extractCsvFromZip(zipBuffer) {
  const { Readable } = await import('stream')
  const { createInflateRaw } = await import('zlib')

  const view = new DataView(zipBuffer.buffer, zipBuffer.byteOffset, zipBuffer.byteLength)

  // Find the first local file header (PK\x03\x04)
  let offset = 0
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error('Not a ZIP file')
  }

  const compressionMethod = view.getUint16(offset + 8, true)
  const compressedSize = view.getUint32(offset + 18, true)
  const fnLen = view.getUint16(offset + 26, true)
  const extraLen = view.getUint16(offset + 28, true)
  const dataOffset = offset + 30 + fnLen + extraLen

  if (compressionMethod === 0) {
    return zipBuffer.subarray(dataOffset, dataOffset + compressedSize).toString('utf-8')
  }

  // Deflate (method 8) — use raw inflate
  const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize)
  return new Promise((resolve, reject) => {
    const chunks = []
    const inflate = createInflateRaw()
    const readable = Readable.from(compressedData)
    readable.pipe(inflate)
    inflate.on('data', (chunk) => chunks.push(chunk))
    inflate.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    inflate.on('error', reject)
  })
}

function parseSpcDailyReport(csvText, dateStr) {
  const lines = csvText.split('\n')
  const events = []

  // Daily reports have 3 header lines (tornado, wind, hail) — hail section starts after "Time,Size,..."
  let inHailSection = false
  for (const line of lines) {
    if (line.startsWith('Time,Size,')) {
      inHailSection = true
      continue
    }
    if (!inHailSection) continue
    if (line.startsWith('Time,')) continue

    const cols = line.split(',')
    if (cols.length < 7) continue

    const size = parseInt(cols[1], 10)
    const lat = parseFloat(cols[5])
    const lng = parseFloat(cols[6])
    if (isNaN(lat) || isNaN(lng) || lat === 0) continue

    const fullYear = 2000 + parseInt(dateStr.slice(0, 2), 10)
    const isoDate = `${fullYear}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`

    events.push({
      date: isoDate,
      year: fullYear,
      lat,
      lng,
      size_inches: size ? size / 100 : null,
    })
  }
  return events
}

async function fetchMonthEvents(year, month, lat, lng, isCurrentMonth) {
  const cacheKey = `hail/recent/${year}/${String(month).padStart(2, '0')}/${Math.floor(lat)}/${Math.floor(lng)}.json`
  const ttl = isCurrentMonth ? 24 * 60 * 60 * 1000 : 180 * 24 * 60 * 60 * 1000

  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: cacheKey,
    }))
    const age = Date.now() - (res.LastModified?.getTime() ?? 0)
    if (age < ttl) {
      const chunks = []
      for await (const chunk of res.Body) chunks.push(chunk)
      return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    }
  } catch {
    // no cache
  }

  const now = new Date()
  const daysInMonth = isCurrentMonth
    ? now.getDate()
    : new Date(year, month, 0).getDate()

  const dates = []
  for (let day = 1; day <= daysInMonth; day++) {
    const yy = String(year).slice(2)
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    dates.push(`${yy}${mm}${dd}`)
  }

  const monthEvents = []
  const BATCH = 15
  for (let i = 0; i < dates.length; i += BATCH) {
    const batch = dates.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (dateStr) => {
      try {
        const url = `https://www.spc.noaa.gov/climo/reports/${dateStr}_rpts_filtered_hail.csv`
        const res = await fetch(url)
        if (!res.ok) return []
        const text = await res.text()
        return parseSpcDailyReport(text, dateStr)
      } catch {
        return []
      }
    }))
    for (const dayEvents of results) monthEvents.push(...dayEvents)
  }

  const nearby = monthEvents.filter(evt => {
    const dLat = Math.abs(evt.lat - lat)
    const dLng = Math.abs(evt.lng - lng)
    return dLat <= 1.5 && dLng <= 1.5
  })

  putToR2(cacheKey, Buffer.from(JSON.stringify(nearby))).catch(() => {})
  return nearby
}

async function fetchRecentHailEvents(lat, lng, radius) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const recentEvents = []

  const months = []
  for (let year = SPC_COMPILED_MAX_YEAR + 1; year <= currentYear; year++) {
    const endMonth = year === currentYear ? currentMonth : 12
    for (let month = 1; month <= endMonth; month++) {
      const isCurrent = year === currentYear && month === currentMonth
      months.push({ year, month, isCurrent })
    }
  }

  // Fetch all months in parallel — each month is at most ~31 daily fetches
  // but completed months will hit cache instantly
  const results = await Promise.all(
    months.map(({ year, month, isCurrent }) =>
      fetchMonthEvents(year, month, lat, lng, isCurrent).catch(() => [])
    )
  )

  for (const monthEvents of results) recentEvents.push(...monthEvents)
  return recentEvents
}

async function getGridCell(lat, lng) {
  const key = gridKey(lat, lng)
  const r2Key = `hail/grid/${key}.json`

  // Check R2 cache
  try {
    const cached = await getFromR2(r2Key)
    if (cached) {
      return JSON.parse(cached.toString('utf-8'))
    }
  } catch {
    // fall through
  }

  // Need to build the grid — download SPC dataset
  const res = await fetch(SPC_HAIL_URL)
  if (!res.ok) throw new Error(`SPC download failed: ${res.status}`)

  const zipBuf = Buffer.from(await res.arrayBuffer())
  const csvText = await extractCsvFromZip(zipBuf)
  const grid = parseSpcCsv(csvText)

  // Cache ALL grid cells to R2 (fire-and-forget batched)
  const cellKeys = Object.keys(grid)

  const batchSize = 20
  for (let i = 0; i < cellKeys.length; i += batchSize) {
    const batch = cellKeys.slice(i, i + batchSize)
    await Promise.all(batch.map(ck =>
      putToR2(`hail/grid/${ck}.json`, Buffer.from(JSON.stringify(grid[ck]))).catch(() => {})
    ))
  }

  return grid[key] || []
}

export default async function handler(req, res) {
  const { lat, lng, radius_miles, from_year } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }

  const latF = parseFloat(lat)
  const lngF = parseFloat(lng)
  const radius = parseFloat(radius_miles) || 5
  const startYear = parseInt(from_year, 10) || 2010

  try {
    // Fetch surrounding grid cells (center + 8 neighbors to handle border cases)
    const centerLatGrid = Math.floor(latF)
    const centerLngGrid = Math.floor(lngF)
    const cellPromises = []

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const gLat = centerLatGrid + dLat
        const gLng = centerLngGrid + dLng
        const r2Key = `hail/grid/${gLat}/${gLng}.json`
        cellPromises.push(
          getFromR2(r2Key)
            .then(buf => buf ? JSON.parse(buf.toString('utf-8')) : null)
            .catch(() => null)
        )
      }
    }

    let cells = await Promise.all(cellPromises)
    const hasCachedData = cells.some(c => c !== null)

    if (!hasCachedData) {
      // No cached grid data — trigger full download + index build
      const allEvents = await getGridCell(latF, lngF)
      cells = [allEvents]
    }

    // Also fetch recent years (2025+) from SPC daily reports
    let recentEvents = []
    try {
      recentEvents = await fetchRecentHailEvents(latF, lngF, radius)
    } catch (e) {
      console.error('Recent hail fetch error:', e.message)
    }

    const allNearbyEvents = []

    // Process compiled grid data (through 2024)
    for (const cell of cells) {
      if (!cell) continue
      for (const evt of cell) {
        if (evt.year < startYear) continue
        const dist = haversineDistance(latF, lngF, evt.lat, evt.lng)
        if (dist <= radius) {
          allNearbyEvents.push({
            date: evt.date,
            lat: evt.lat,
            lng: evt.lng,
            distance_mi: Math.round(dist * 10) / 10,
            hail_size_inches: evt.size_inches,
            year: evt.year,
          })
        }
      }
    }

    // Process recent daily report data (2025+)
    for (const evt of recentEvents) {
      if (evt.year < startYear) continue
      const dist = haversineDistance(latF, lngF, evt.lat, evt.lng)
      if (dist <= radius) {
        allNearbyEvents.push({
          date: evt.date,
          lat: evt.lat,
          lng: evt.lng,
          distance_mi: Math.round(dist * 10) / 10,
          hail_size_inches: evt.size_inches,
          year: evt.year,
        })
      }
    }

    allNearbyEvents.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    const summary = {
      total_events: allNearbyEvents.length,
      max_hail_size: allNearbyEvents.reduce((max, e) => Math.max(max, e.hail_size_inches || 0), 0),
      years_with_hail: [...new Set(allNearbyEvents.map(e => e.year))].sort(),
    }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({
      lat: latF,
      lng: lngF,
      radius_miles: radius,
      summary,
      events: allNearbyEvents.slice(0, 200),
    })
  } catch (e) {
    console.error('Hail events error:', e)
    return res.status(500).json({ error: e.message || 'Internal server error' })
  }
}
