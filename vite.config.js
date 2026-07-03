import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { viteApiDevPlugin } from './scripts/viteApiDevPlugin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true'

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
          if (req.url?.startsWith('/__/firebase/init.json')) {
            const host = req.headers.host || `localhost:${server.config.server.port || 3000}`
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              apiKey: process.env.VITE_FIREBASE_API_KEY || '',
              authDomain: (process.env.VITE_FIREBASE_AUTH_DOMAIN || host).replace(/^https?:\/\//, '').replace(/\/$/, ''),
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
    },
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
      '/__/auth': {
        target: `https://${process.env.VITE_FIREBASE_PROJECT_ID || 'roofscout-885c6'}.firebaseapp.com`,
        changeOrigin: true,
        secure: true
      }
    }
  }
})
