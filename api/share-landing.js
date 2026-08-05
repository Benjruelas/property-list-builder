/**
 * GET /api/share-landing?token=… — OG HTML for /s/{token} crawlers + browser redirect.
 */

import { rateLimit } from './_lib/rateLimit.js'
import { resolveSharePreview } from './_lib/resourceShareResolve.js'
import {
  buildResourceShareClaimPath,
  buildResourceSharePublicUrl,
  normalizePublicOrigin,
} from './_lib/publicLinks.js'
import { escapeHtml } from './_lib/resourceShareInvites.js'

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://knockscout.app'
}

function htmlPage({ title, description, imageUrl, claimUrl, canonicalUrl }) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const img = escapeHtml(imageUrl)
  const claim = escapeHtml(claimUrl)
  const canon = escapeHtml(canonicalUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${canon}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="KnockScout" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${canon}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
  <meta http-equiv="refresh" content="0;url=${claim}" />
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#0a0a0a; color:#fafafa;
      display:flex; min-height:100vh; align-items:center; justify-content:center; }
    a { color:#60a5fa; }
    .card { max-width:28rem; padding:2rem; text-align:center; }
  </style>
</head>
<body>
  <div class="card">
    <p>Opening KnockScout…</p>
    <p><a href="${claim}">Continue</a></p>
  </div>
  <script>location.replace(${JSON.stringify(claimUrl)})</script>
</body>
</html>`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = String(req.query?.token || '').trim()
  if (!token || token.length < 8) {
    return res.status(404).send('Share link not found')
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const rl = await rateLimit({ key: `share-landing:${ip}`, limit: 120, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).send('Too many requests')
  }

  const origin = normalizePublicOrigin(resolveOrigin(req))
  const claimPath = buildResourceShareClaimPath(token)
  const claimUrl = `${origin}${claimPath}`
  const canonicalUrl = buildResourceSharePublicUrl(origin, token)
  const imageUrl = `${origin}/api/share-card?token=${encodeURIComponent(token)}`

  try {
    const { error, preview, description } = await resolveSharePreview(token)
    if (error === 'not_found' || error === 'revoked' || error === 'expired') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(404).send(htmlPage({
        title: 'KnockScout',
        description: 'This share link is no longer available.',
        imageUrl: `${origin}/brand/emblem-blue-512.png`,
        claimUrl: origin,
        canonicalUrl,
      }))
    }

    const title = preview
      ? (preview.resourceType === 'deal'
        ? `${preview.title || preview.name} · KnockScout`
        : `${preview.name} · KnockScout`)
      : 'KnockScout'
    const desc = description || preview?.address || 'Shared on KnockScout'

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).send(htmlPage({
      title,
      description: desc,
      imageUrl,
      claimUrl,
      canonicalUrl,
    }))
  } catch (err) {
    console.error('share-landing error', err)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(htmlPage({
      title: 'KnockScout',
      description: 'Shared on KnockScout',
      imageUrl,
      claimUrl,
      canonicalUrl,
    }))
  }
}
