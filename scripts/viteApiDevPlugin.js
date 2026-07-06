import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseQuery(url) {
  const idx = url.indexOf('?')
  if (idx < 0) return {}
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)))
}

/**
 * Serve /api/* from ./api handlers in dev when Vercel dev is not running.
 * Runs before Vite's proxy so handlers are available on `npm run dev` alone.
 */
export function viteApiDevPlugin({ apiDir }) {
  return {
    name: 'vite-api-dev',
    configureServer(server) {
      // Vite only exposes VITE_* to client code; API handlers need full .env.* vars.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/api/')) return next()

        const pathname = rawUrl.split('?')[0]
        const route = pathname.slice('/api/'.length)
        if (!route || route.includes('/') || route.includes('..')) return next()

        const handlerPath = path.join(apiDir, `${route}.js`)
        if (!fs.existsSync(handlerPath)) return next()

        try {
          const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`)
          const handler = mod.default
          if (typeof handler !== 'function') return next()

          const bodyBuf = await readBody(req)
          const contentType = req.headers['content-type'] || ''
          if (contentType.includes('application/json')) {
            try {
              req.body = bodyBuf.length ? JSON.parse(bodyBuf.toString('utf8')) : {}
            } catch {
              req.body = {}
            }
          } else if (bodyBuf.length) {
            req.body = bodyBuf.toString('utf8')
          } else {
            req.body = {}
          }

          req.query = parseQuery(rawUrl)

          if (!res.status) {
            res.status = (code) => {
              res.statusCode = code
              return res
            }
          }
          if (!res.json) {
            res.json = (payload) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
            }
          }
          if (!res.send) {
            res.send = (payload) => {
              if (Buffer.isBuffer(payload) || typeof payload === 'string') {
                res.end(payload)
              } else {
                res.json(payload)
              }
            }
          }

          await handler(req, res)
        } catch (err) {
          console.error(`[vite-api-dev] ${route}`, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal server error', message: err.message }))
          }
        }
      })
    },
  }
}
