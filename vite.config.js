import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  plugins: [
    react(),
    // Serve init.json and proxy auth for Firebase (fixes 404 that breaks sign-in)
    {
      name: 'firebase-auth-proxy',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/__/firebase/init.json')) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              apiKey: process.env.VITE_FIREBASE_API_KEY || '',
              authDomain: `localhost:${server.config.server.port || 3000}`
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
  worker: {
    format: 'es'
  },
  build: {
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
