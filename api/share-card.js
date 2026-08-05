/**
 * GET /api/share-card?token=… — 1200×630 PNG for SMS/iMessage link previews.
 * Satellite → scrim → white logo (left) + formatted lead info (right).
 *
 * Text is rendered with Satori + bundled Inter fonts. Sharp's SVG <text>
 * has no usable fonts on Vercel serverless, which produced tiny glyph blobs.
 */

import sharp from 'sharp'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
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
const TEXT_RIGHT_PAD = 48

const __dirname = dirname(fileURLToPath(import.meta.url))

let fontsPromise = null

function mapboxToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || ''
}

async function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const dir = join(__dirname, '_lib/fonts')
      const [regular, semiBold] = await Promise.all([
        readFile(join(dir, 'Inter-Regular.woff')),
        readFile(join(dir, 'Inter-SemiBold.woff')),
      ])
      return [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: semiBold, weight: 600, style: 'normal' },
      ]
    })()
  }
  return fontsPromise
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

function el(type, style, children) {
  const props = { style }
  if (children !== undefined) props.children = children
  return { type, props }
}

function line(text, { fontSize, fontWeight = 400, marginBottom = 0, maxLines = 2 } = {}) {
  return el(
    'div',
    {
      display: 'flex',
      fontSize,
      fontWeight,
      color: '#ffffff',
      marginBottom,
      lineHeight: 1.2,
      maxHeight: fontSize * 1.2 * maxLines,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      width: '100%',
    },
    String(text),
  )
}

async function buildTextOverlay({ name, address, phone, email, resourceType }) {
  const displayName = String(name || (resourceType === 'deal' ? 'Deal' : 'Lead')).trim()
  const displayAddress = formatAddressCard(address)
  const displayPhone = formatPhoneCard(phone)
  const displayEmail = String(email || '').trim()

  const children = [
    line(displayName, { fontSize: 56, fontWeight: 600, marginBottom: 20, maxLines: 2 }),
  ]
  if (displayAddress) {
    children.push(line(displayAddress, { fontSize: 32, fontWeight: 400, marginBottom: 16, maxLines: 2 }))
  }
  if (displayPhone) {
    children.push(line(displayPhone, { fontSize: 30, fontWeight: 400, marginBottom: 12, maxLines: 1 }))
  }
  if (displayEmail) {
    children.push(line(displayEmail, { fontSize: 28, fontWeight: 400, marginBottom: 0, maxLines: 1 }))
  }

  const fonts = await loadFonts()
  const svg = await satori(
    el(
      'div',
      {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingLeft: TEXT_LEFT,
        paddingRight: TEXT_RIGHT_PAD,
        fontFamily: 'Inter',
      },
      children,
    ),
    { width: WIDTH, height: HEIGHT, fonts },
  )

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    background: 'rgba(0,0,0,0)',
  })
  return Buffer.from(resvg.render().asPng())
}

function buildScrimOverlay() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#000000" fill-opacity="0.52"/>
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
      input: await buildTextOverlay({ name, address, phone, email, resourceType }),
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
