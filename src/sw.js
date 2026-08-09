/* global self */
/**
 * Combined service worker: Workbox app-shell/tile/parcel caching + web push.
 * Built via vite-plugin-pwa injectManifest (self.__WB_MANIFEST injected at build).
 */

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const TILE_CACHE = 'knockscout-map-tiles-v2'
const PARCEL_CACHE = 'knockscout-parcel-details-v2'

function isSameOriginApi(url, pathPrefix) {
  try {
    const u = new URL(url)
    return u.origin === self.location.origin && u.pathname.startsWith(pathPrefix)
  } catch {
    return false
  }
}

// Parcel vector tiles + Google basemap proxy — cache-first with expiry.
// Respects Cache-Control from R2/proxy responses via CacheableResponsePlugin.
registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') return false
    return (
      isSameOriginApi(url.href, '/api/tiles')
      || isSameOriginApi(url.href, '/api/google-tiles-proxy')
    )
  },
  new CacheFirst({
    cacheName: TILE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 2500,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// Parcel attribute lookups — stale-while-revalidate for recently viewed areas.
registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') return false
    return isSameOriginApi(url.href, '/api/parcel')
  },
  new StaleWhileRevalidate({
    cacheName: PARCEL_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// --- Push notifications (from legacy public/sw.js) ---

self.addEventListener('push', (event) => {
  let data = { title: 'Notification', body: '' }
  try {
    if (event.data) {
      const t = event.data.text()
      const parsed = JSON.parse(t)
      data = { ...data, ...parsed }
    }
  } catch {
    /* use defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', {
      body: data.body || '',
      tag: data.tag || 'default',
      data: data.data || {},
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  )
})

function buildNotifyUrl(payload) {
  const type = payload?.type
  const params = new URLSearchParams()
  params.set('notify', type || 'general')
  if (payload?.listId) params.set('listId', payload.listId)
  if (payload?.pipelineId) params.set('pipelineId', payload.pipelineId)
  if (payload?.pathId) params.set('pathId', payload.pathId)
  if (payload?.teamId) params.set('teamId', payload.teamId)
  if (payload?.templateId) params.set('templateId', payload.templateId)
  if (payload?.leadId) params.set('leadId', payload.leadId)
  if (payload?.taskId) params.set('taskId', payload.taskId)
  return `/?${params.toString()}`
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const payload = event.notification.data || {}
  const targetUrl = buildNotifyUrl(payload)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url && 'focus' in c) {
          c.postMessage({ type: 'NOTIFICATION_CLICK', data: payload })
          return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
