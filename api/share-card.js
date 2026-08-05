/**
 * GET /api/share-card?token=… — 1200×630 PNG for SMS/iMessage link previews.
 * Satellite background → dark scrim → white KnockScout logo (left) + lead info (right).
 */

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rateLimit } from './_lib/rateLimit.js'
import { resolveSharePreview } from './_lib/resourceShareResolve.js'

const WIDTH = 1200
const HEIGHT = 630
const LOGO_SIZE = 380
const LOGO_LEFT = 48
const TEXT_LEFT = 480

const __dirname = dirname(fileURLToPath(import.meta.url))

function mapboxToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || ''
}

async function fetchSatellite(lat, lng) {
  const token = mapboxToken()
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `${lng},${lat},17,0/${WIDTH}x${HEIGHT}@2x?access_token=${encodeURIComponent(token)}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('mapbox static failed', res.status)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.warn('mapbox static error', e.message)
    return null
  }
}

async function loadLogo() {
  const candidates = [
    join(process.cwd(), 'public/brand/emblem-white-512.png'),
    join(__dirname, '../public/brand/emblem-white-512.png'),
  ]
  for (const path of candidates) {
    try {
      return await readFile(path)
    } catch {
      /* try next */
    }
  }
  return null
}

function escapeSvgText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s, max) {
  const t = String(s || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** Full-bleed dark scrim between background and foreground content. */
function buildScrimOverlay() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.65"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#scrim)"/>
</svg>`)
}

/** Large white text on the right half. */
function buildTextOverlay({ name, address, phone, email, resourceType }) {
  const lines = []
  const headline = truncate(name || (resourceType === 'deal' ? 'Deal' : 'Lead'), 22)
  lines.push({ text: headline, size: 72, weight: 700 })
  if (address) lines.push({ text: truncate(address, 26), size: 42, weight: 500 })
  if (phone) lines.push({ text: truncate(phone, 22), size: 38, weight: 500 })
  if (email) lines.push({ text: truncate(email, 24), size: 38, weight: 500 })

  const lineGap = 78
  const blockHeight = lines.length * lineGap
  const startY = Math.round((HEIGHT - blockHeight) / 2) + 56

  const textNodes = lines.map((line, i) => {
    const y = startY + i * lineGap
    return `<text x="${TEXT_LEFT}" y="${y}" font-family="Sora, system-ui, -apple-system, sans-serif" font-size="${line.size}" font-weight="${line.weight}" fill="#ffffff">${escapeSvgText(line.text)}</text>`
  }).join('\n')

  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${textNodes}
</svg>`)
}

function fallbackBackground() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="50%" stop-color="#132033"/>
      <stop offset="100%" stop-color="#1a2740"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`)
}

export const config = {
  maxDuration: 30,
  memory: 1024,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = String(req.query?.token || '').trim()
  if (!token || token.length < 8) {
    return res.status(404).json({ error: 'Not found' })
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const rl = await rateLimit({ key: `share-card:${ip}`, limit: 120, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    const { error, preview } = await resolveSharePreview(token)
    const name = preview?.name || (preview?.resourceType === 'deal' ? 'Deal' : 'KnockScout')
    const address = preview?.address || ''
    const phone = preview?.phone || ''
    const email = preview?.email || ''
    const resourceType = preview?.resourceType || 'lead'

    let base
    if (!error && preview && Number.isFinite(preview.lat) && Number.isFinite(preview.lng)) {
      const sat = await fetchSatellite(preview.lat, preview.lng)
      if (sat) {
        base = await sharp(sat).resize(WIDTH, HEIGHT, { fit: 'cover' }).png().toBuffer()
      }
    }
    if (!base) {
      base = await sharp(fallbackBackground()).png().toBuffer()
    }

    // Layer order: background → scrim → logo + text
    const composites = [
      { input: buildScrimOverlay(), top: 0, left: 0 },
      { input: buildTextOverlay({ name, address, phone, email, resourceType }), top: 0, left: 0 },
    ]
    const logo = await loadLogo()
    if (logo) {
      const logoBuf = await sharp(logo)
        .ensureAlpha()
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer()
      const meta = await sharp(logoBuf).metadata()
      const logoH = meta.height || LOGO_SIZE
      const logoTop = Math.round((HEIGHT - logoH) / 2)
      composites.splice(1, 0, { input: logoBuf, top: logoTop, left: LOGO_LEFT })
    }

    const out = await sharp(base).composite(composites).png({ compressionLevel: 6 }).toBuffer()

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400')
    return res.status(200).send(out)
  } catch (err) {
    console.error('share-card error', err)
    try {
      const fallback = await sharp(fallbackBackground()).png().toBuffer()
      res.setHeader('Content-Type', 'image/png')
      return res.status(200).send(fallback)
    } catch {
      return res.status(500).json({ error: 'Failed to render card' })
    }
  }
}
