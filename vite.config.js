import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { viteApiDevPlugin } from './scripts/viteApiDevPlugin.js'
import { resolveAuthDomainFromHost } from './api/_lib/resolveAuthDomain.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true'
const AUTH_IFRAME_SHELL = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

function attachDevApiResponseHelpers(res) {
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
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'api/**/*.test.js'],
  },
  plugins: [
    react(),
    viteApiDevPlugin({ apiDir: path.join(__dirname, 'api') }),
    // Serve init.json and proxy auth for Firebase (fixes 404 that breaks sign-in)
    {
      name: 'firebase-auth-proxy',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.headers['sec-fetch-dest'] === 'iframe' && (req.url || '').split('?')[0] === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(AUTH_IFRAME_SHELL)
            return
          }
          next()
        })

        server.middlewares.use(async (req, res, next) => {
          const rawUrl = req.url || ''
          if (!rawUrl.startsWith('/__/auth/')) return next()

          const pathPart = rawUrl.slice('/__/auth/'.length)
          const qIdx = pathPart.indexOf('?')
          const authPath = qIdx >= 0 ? pathPart.slice(0, qIdx) : pathPart
          const extraQs = qIdx >= 0 ? pathPart.slice(qIdx + 1) : ''
          const params = new URLSearchParams(extraQs)
          params.set('path', authPath)
          req.query = Object.fromEntries(params)

          try {
            const mod = await import(`${pathToFileURL(path.join(__dirname, 'api/firebase-auth-proxy.js')).href}?t=${Date.now()}`)
            attachDevApiResponseHelpers(res)
            await mod.default(req, res)
          } catch (err) {
            console.error('[firebase-auth-proxy]', err)
            if (!res.headersSent) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Auth proxy failed' }))
            }
          }
        })

        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/__/firebase/init.json')) {
            const host = req.headers.host || `localhost:${server.config.server.port || 3000}`
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              apiKey: process.env.VITE_FIREBASE_API_KEY || '',
              authDomain: resolveAuthDomainFromHost(host, process.env.VITE_FIREBASE_AUTH_DOMAIN),
            }))
            return
          }
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Capacitor packages are web-safe stubs but confuse Vite's dep optimizer after lockfile changes.
    exclude: [
      '@capacitor/core',
      '@capacitor/app',
      '@capacitor/filesystem',
      '@capacitor-community/media',
    ],
  },
  worker: {
    format: 'es'
  },
  build: {
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/react-map-gl')) {
            return 'map'
          }
          if (id.includes('node_modules/firebase')) {
            return 'firebase'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'radix'
          }
          if (id.includes('node_modules/pdfjs-dist') || id.includes('node_modules/pdf-lib') || id.includes('node_modules/pdfkit')) {
            return 'pdf'
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    https: devHttps,
    proxy: {
      // Vite on :3000 — run `npm run dev:api` (vercel dev on :3001) for serverless routes.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    }
  }
})
