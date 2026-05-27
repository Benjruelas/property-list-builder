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

/** SPC compiled CSV stores times in CST (except GMT reports). */
function spcTimeParts(timeStr) {
  if (!timeStr) return null
  const s = String(timeStr).trim()
  if (s.includes(':')) {
    const [h, m] = s.split(':')
    const hh = parseInt(h, 10)
    const mm = parseInt(m, 10)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null
    return { hh, mm }
  }
  const padded = s.padStart(4, '0')
  const hh = parseInt(padded.slice(0, 2), 10)
  const mm = parseInt(padded.slice(2, 4), 10)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return { hh, mm }
}

function spcLocalTimeToUtc(date, timeStr, tz) {
  if (!date || !timeStr) return null
  const parts = spcTimeParts(timeStr)
  if (!parts) return null
  const [y, m, d] = date.split('-').map(Number)
  const tzNum = parseInt(tz, 10)
  // SPC converts all times to CST except GMT (tz=9) which stays UTC
  const utcAddHours = tzNum === 9 ? 0 : 6
  const dt = new Date(Date.UTC(y, m - 1, d, parts.hh + utcAddHours, parts.mm))
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`
}

function spcUtcTimeFromDailyReport(timeRaw) {
  const padded = String(timeRaw || '').trim().padStart(4, '0')
  if (padded.length < 4) return null
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`
}

const HAIL_GRID_CACHE_PREFIX = 'hail/grid/v2'

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
    const time = cols[5]?.trim()
    const tz = cols[6]?.trim()
    const mag = parseFloat(cols[10])
    const lat = parseFloat(cols[15])
    const lng = parseFloat(cols[16])
    if (isNaN(lat) || isNaN(lng) || lat === 0) continue

    const key = gridKey(lat, lng)
    if (!grid[key]) grid[key] = []
    grid[key].push({
      date,
      year,
      lat,
      lng,
      size_inches: isNaN(mag) ? null : mag,
      time_utc: spcLocalTimeToUtc(date, time, tz),
    })
  }

  return grid
}

async function extractCsvFromZip(zipBuffer) {
  const { inflateRawSync } = await import('zlib')

  const EOCD_SIG = 0x06054b50
  const CD_SIG = 0x02014b50
  const LOCAL_SIG = 0x04034b50

  let eocd = -1
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP: end of central directory not found')

  const cdOffset = zipBuffer.readUInt32LE(eocd + 16)
  let pos = cdOffset

  while (pos + 46 <= eocd && zipBuffer.readUInt32LE(pos) === CD_SIG) {
    const compressionMethod = zipBuffer.readUInt16LE(pos + 10)
    const compressedSize = zipBuffer.readUInt32LE(pos + 20)
    const fnLen = zipBuffer.readUInt16LE(pos + 28)
    const extraLen = zipBuffer.readUInt16LE(pos + 30)
    const commentLen = zipBuffer.readUInt16LE(pos + 32)
    const localHeaderOffset = zipBuffer.readUInt32LE(pos + 42)
    const filename = zipBuffer.toString('utf8', pos + 46, pos + 46 + fnLen)

    pos += 46 + fnLen + extraLen + commentLen

    if (filename.startsWith('__MACOSX/') || !filename.endsWith('.csv')) continue

    if (zipBuffer.readUInt32LE(localHeaderOffset) !== LOCAL_SIG) {
      throw new Error(`Invalid ZIP: local header missing for ${filename}`)
    }

    const localFnLen = zipBuffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28)
    const dataOffset = localHeaderOffset + 30 + localFnLen + localExtraLen

    if (!compressedSize) {
      throw new Error(`Invalid ZIP: missing compressed size for ${filename}`)
    }

    const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize)

    if (compressionMethod === 0) {
      return compressedData.toString('utf-8')
    }
    if (compressionMethod === 8) {
      return inflateRawSync(compressedData).toString('utf-8')
    }
    throw new Error(`Unsupported ZIP compression method ${compressionMethod}`)
  }

  throw new Error('CSV entry not found in ZIP')
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
    const timeRaw = cols[0]?.trim()

    events.push({
      date: isoDate,
      year: fullYear,
      lat,
      lng,
      size_inches: size ? size / 100 : null,
      time_utc: spcUtcTimeFromDailyReport(timeRaw),
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
  const r2Key = `${HAIL_GRID_CACHE_PREFIX}/${key}.json`

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
  if (zipBuf.length < 1_000_000) {
    throw new Error(`SPC download looks truncated (${zipBuf.length} bytes)`)
  }
  const csvText = await extractCsvFromZip(zipBuf)
  const grid = parseSpcCsv(csvText)

  // Cache ALL grid cells to R2 (fire-and-forget batched)
  const cellKeys = Object.keys(grid)

  const batchSize = 20
  for (let i = 0; i < cellKeys.length; i += batchSize) {
    const batch = cellKeys.slice(i, i + batchSize)
    await Promise.all(batch.map(ck =>
      putToR2(`${HAIL_GRID_CACHE_PREFIX}/${ck}.json`, Buffer.from(JSON.stringify(grid[ck]))).catch(() => {})
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
        const r2Key = `${HAIL_GRID_CACHE_PREFIX}/${gLat}/${gLng}.json`
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
            time_utc: evt.time_utc || null,
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
          time_utc: evt.time_utc || null,
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
