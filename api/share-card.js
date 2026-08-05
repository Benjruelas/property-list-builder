/**
 * GET /api/share-card?token=… — 1200×630 PNG for SMS/iMessage link previews.
 * Satellite → scrim → white logo (left) + formatted lead info (right).
 */

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rateLimit } from './_lib/rateLimit.js'
import { resolveSharePreview } from './_lib/resourceShareResolve.js'

const WIDTH = 1200
const HEIGHT = 630
const LOGO_SIZE = 320
const LOGO_LEFT = 48
const TEXT_LEFT = 420
const TEXT_MAX_WIDTH = 720
// Arial/Helvetica are available in sharp's SVG renderer on Vercel; custom webfonts are not.
const FONT = 'Arial, Helvetica, sans-serif'

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

/** Format US phone as (XXX) XXX-XXXX when possible. */
function formatPhoneCard(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return String(value || '').trim()
}

/** Street, city, state — drop zip / country / extra noise. */
function formatAddressCard(value) {
  let s = String(value || '').trim()
  if (!s) return ''
  s = s.replace(/,\s*(United States|USA|U\.S\.A\.)\s*$/i, '').trim()
  s = s.replace(/\s+\d{5}(?:-\d{4})?\s*$/, '').trim()
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const street = parts[0]
    const city = parts[1]
    const state = parts[2].replace(/\s+\d{5}(?:-\d{4})?.*$/, '').trim()
    return [street, city, state].filter(Boolean).join(', ')
  }
  if (parts.length === 2) {
    return `${parts[0]}, ${parts[1].replace(/\s+\d{5}(?:-\d{4})?.*$/, '').trim()}`
  }
  return s
}

/** Approx wrap by pixel width (Arial ~0.55em average). */
function wrapText(text, fontSize, maxWidth, maxLines = 2) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const avgChar = fontSize * 0.55
  const maxChars = Math.max(8, Math.floor(maxWidth / avgChar))
  const words = raw.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)

  // Ellipsis if we still have leftover words
  const used = lines.join(' ').split(/\s+/).length
  if (used < words.length && lines.length) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = last.length > 3 ? `${last.replace(/\s+\S*$/, '')}…` : `${last}…`
  }
  return lines.slice(0, maxLines)
}

function buildScrimOverlay() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#000000" fill-opacity="0.52"/>
</svg>`)
}

function buildTextOverlay({ name, address, phone, email, resourceType }) {
  const displayName = String(name || (resourceType === 'deal' ? 'Deal' : 'Lead')).trim()
  const displayAddress = formatAddressCard(address)
  const displayPhone = formatPhoneCard(phone)
  const displayEmail = String(email || '').trim()

  const blocks = []
  const nameLines = wrapText(displayName, 58, TEXT_MAX_WIDTH, 2)
  for (let i = 0; i < nameLines.length; i++) {
    blocks.push({ text: nameLines[i], size: 58, weight: 700, gapAfter: i === nameLines.length - 1 ? 24 : 8 })
  }
  if (displayAddress) {
    const addrLines = wrapText(displayAddress, 34, TEXT_MAX_WIDTH, 2)
    for (let i = 0; i < addrLines.length; i++) {
      blocks.push({ text: addrLines[i], size: 34, weight: 500, gapAfter: i === addrLines.length - 1 ? 18 : 6 })
    }
  }
  if (displayPhone) {
    blocks.push({ text: displayPhone, size: 32, weight: 500, gapAfter: 12 })
  }
  if (displayEmail) {
    blocks.push({
      text: wrapText(displayEmail, 30, TEXT_MAX_WIDTH, 1)[0] || displayEmail,
      size: 30,
      weight: 500,
      gapAfter: 0,
    })
  }

  // Measure total height using font sizes + gaps, then vertically center.
  let totalH = 0
  for (const b of blocks) totalH += b.size + b.gapAfter
  let y = Math.round((HEIGHT - totalH) / 2) + (blocks[0]?.size || 56)

  const textNodes = blocks.map((b) => {
    const node = `<text x="${TEXT_LEFT}" y="${y}" font-family="${FONT}" font-size="${b.size}" font-weight="${b.weight}" fill="#ffffff">${escapeSvgText(b.text)}</text>`
    y += b.size + b.gapAfter
    return node
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

    const composites = [
      { input: buildScrimOverlay(), top: 0, left: 0 },
    ]

    const logo = await loadLogo()
    if (logo) {
      const logoBuf = await sharp(logo)
        .ensureAlpha()
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside' })
        .png()
        .toBuffer()
      const meta = await sharp(logoBuf).metadata()
      const logoH = meta.height || LOGO_SIZE
      const logoTop = Math.round((HEIGHT - logoH) / 2)
      composites.push({ input: logoBuf, top: logoTop, left: LOGO_LEFT })
    }

    composites.push({
      input: buildTextOverlay({ name, address, phone, email, resourceType }),
      top: 0,
      left: 0,
    })

    const out = await sharp(base).composite(composites).png({ compressionLevel: 6 }).toBuffer()

    res.setHeader('Content-Type', 'image/png')
    // Short cache so layout fixes show up quickly after deploys.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
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
