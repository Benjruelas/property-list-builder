/**
 * CORS helper with an optional origin allowlist.
 *
 * By default (no ALLOWED_ORIGINS configured) we keep the historical behavior of
 * `Access-Control-Allow-Origin: *`, which is required for Capacitor native
 * origins (capacitor://localhost, https://localhost) and same-origin web.
 *
 * When ALLOWED_ORIGINS is set (comma-separated), the request Origin is echoed
 * back only if it is on the list; otherwise the first allowed origin is used.
 * This lets production lock down cross-origin access to authenticated routes
 * without hardcoding the domain in code.
 */
function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function applyCors(req, res, { methods = 'GET, POST, PATCH, DELETE, OPTIONS' } = {}) {
  const list = allowedOrigins()
  const origin = req.headers.origin || ''
  if (list.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && list.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else {
    // Not an allowed browser origin. Native apps typically send no/opaque
    // Origin, so fall back to the primary allowed origin.
    res.setHeader('Access-Control-Allow-Origin', list[0])
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migrate-Secret')
}

export default applyCors
