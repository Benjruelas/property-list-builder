/* global self */
/**
 * Combined service worker: Workbox app-shell/tile/parcel caching + web push.
 * Built via vite-plugin-pwa injectManifest (self.__WB_MANIFEST injected at build).
 *
 * IMPORTANT (iOS Home Screen):
 * Workbox PrecacheRoute matches navigations to `/` via directoryIndex → index.html.
 * That route is registered by precacheAndRoute() and would win over later navigation
 * handlers (first match wins). An incomplete/corrupt precache then surfaces as Safari's
 * native "not connected to the internet" page — even when online — and can also swallow
 * `/?recover=1` before our recover handler runs.
 *
 * So we: precache() assets, register navigation handlers FIRST, then addRoute().
 */

import { addRoute, cleanupOutdatedCaches, matchPrecache, precache } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

precache(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * One-shot recovery for stuck iOS Home Screen / Safari Web Clips.
 * Visit https://knockscout.app/?recover=1 (in Safari) to wipe SW + caches.
 */
async function recoverAndFetch(request) {
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  } catch {
    /* ignore */
  }
  try {
    await self.registration.unregister()
  } catch {
    /* ignore */
  }

  const url = new URL(request.url)
  url.searchParams.delete('recover')
  url.searchParams.delete('nosw')
  const clean = `${url.pathname}${url.search}${url.hash}` || '/'
  // fetch() from a SW goes to the network and does not re-enter this worker.
  return fetch(clean, { cache: 'reload' })
}

/**
 * Network-first SPA navigations that never reject respondWith.
 * Bare Workbox NetworkOnly throws `no-response` when fetch fails, which Safari
 * surfaces as its native error page (even when a precached shell exists).
 * We intentionally do NOT use PrecacheRoute for navigations (directoryIndex
 * can poison Home Screen cold starts) — only an explicit matchPrecache fallback.
 */
async function networkThenPrecacheShell(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) return response
    // Non-OK (e.g. 5xx): still prefer live HTML when present; fall through only if empty.
    if (response) return response
  } catch {
    /* network failed — try precached shell */
  }

  const shell = (await matchPrecache('/index.html')) || (await matchPrecache('index.html'))
  if (shell) return shell

  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnockScout</title></head><body><p>Unable to load KnockScout. Check your connection, then open <a href="/recover.html">recover.html</a> in Safari.</p></body></html>',
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}

// Navigation handlers MUST be registered before addRoute() / PrecacheRoute.
registerRoute(
  ({ request, url }) => (
    request.mode === 'navigate'
    && (url.searchParams.has('recover') || url.searchParams.has('nosw'))
  ),
  ({ request }) => recoverAndFetch(request),
)

registerRoute(
  ({ request, url }) => (
    request.mode === 'navigate'
    && !url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/__/')
  ),
  ({ event }) => networkThenPrecacheShell(event.request),
)

// Precache route for hashed assets / shell files (non-navigation requests win here).
addRoute()

// v5: tile/parcel runtime caches (bump to drop any poisoned iOS entries).
const TILE_CACHE = 'knockscout-map-tiles-v5'
const PARCEL_CACHE = 'knockscout-parcel-details-v5'

function isSameOriginApi(url, pathPrefix) {
  try {
    const u = new URL(url)
    return u.origin === self.location.origin && u.pathname.startsWith(pathPrefix)
  } catch {
    return false
  }
}

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
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 2500,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') return false
    return isSameOriginApi(url.href, '/api/parcel')
  },
  new StaleWhileRevalidate({
    cacheName: PARCEL_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// --- Push notifications ---

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
