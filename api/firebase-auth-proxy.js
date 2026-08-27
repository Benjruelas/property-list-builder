/**
 * Proxies Firebase Auth handler when using custom auth domain.
 * Requires VITE_FIREBASE_PROJECT_ID in env.
 */

export default async function handler(req, res) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    return res.status(500).json({ error: 'Auth proxy misconfigured' })
  }

  const path = req.query.path || 'handler'
  const firebaseUrl = `https://${projectId}.firebaseapp.com/__/auth/${path}`
  const url = new URL(firebaseUrl)
  Object.entries(req.query).forEach(([k, v]) => {
    if (k !== 'path' && v) url.searchParams.set(k, Array.isArray(v) ? v[0] : v)
  })

  try {
    const headers = { ...req.headers }
    delete headers.host
    delete headers.connection

    const fetchRes = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    })

    res.status(fetchRes.status)
    let body = await fetchRes.text()
    const contentType = fetchRes.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      // Keep Firebase scripts running, but show a branded KnockScout shell instead of a blank page.
      const brandShell = `
<style>
  html,body{background:#0a0a0a!important;margin:0!important}
  body>*:not(#ks-auth-brand){visibility:hidden!important;opacity:0!important}
  #ks-auth-brand{
    visibility:visible!important;opacity:1!important;pointer-events:none;
    position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;padding:28px 20px;
    background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center
  }
  #ks-auth-brand img{width:48px;height:48px}
  #ks-auth-brand .ks-title{font-size:18px;font-weight:600;letter-spacing:-0.02em;margin:0}
  #ks-auth-brand .ks-copy{font-size:14px;line-height:1.45;color:rgba(255,255,255,.72);margin:0;max-width:28rem}
  #ks-auth-brand .ks-spin{
    width:28px;height:28px;border:2px solid rgba(125,211,252,.25);border-top-color:#7dd3fc;
    border-radius:50%;animation:ks-spin .8s linear infinite;margin-top:4px
  }
  @keyframes ks-spin{to{transform:rotate(360deg)}}
</style>
<div id="ks-auth-brand" role="status" aria-live="polite">
  <img src="/brand/emblem-white.svg" alt="" width="48" height="48"/>
  <p class="ks-title">KnockScout</p>
  <p class="ks-copy">Completing Google sign-in. You&apos;ll return to KnockScout next — keep this Safari tab open.</p>
  <div class="ks-spin" aria-hidden="true"></div>
</div>`
      if (body.includes('</body>')) {
        body = body.replace('</body>', `${brandShell}</body>`)
      } else if (body.includes('</head>')) {
        body = body.replace('</head>', `</head>${brandShell}`)
      } else {
        body = brandShell + body
      }
    }
    // Don't forward encoding/length: fetch().text() decompresses the body,
    // so forwarding Content-Encoding causes ERR_CONTENT_DECODING_FAILED.
    // Strip X-Frame-Options — Firebase Auth embeds /__/auth/iframe during
    // redirect sign-in; any XFO value breaks the OAuth relay.
    // Strip caching headers — upstream's max-age=1800 let browsers cache auth
    // docs with stale security headers, breaking sign-in for up to 30 minutes.
    fetchRes.headers.forEach((v, k) => {
      const lower = k.toLowerCase()
      if (
        [
          'transfer-encoding', 'content-encoding', 'content-length',
          'x-frame-options', 'cache-control', 'expires', 'etag', 'last-modified', 'age',
        ].includes(lower)
      ) {
        return
      }
      res.setHeader(k, v)
    })
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.send(body)
  } catch (err) {
    console.error('Firebase auth proxy error:', err)
    res.status(502).json({ error: 'Auth proxy failed' })
  }
}
