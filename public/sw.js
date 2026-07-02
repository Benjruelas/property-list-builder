/* global self */

// Update strategy: this SW is push-only (no fetch caching), so activating a
// new version immediately is always safe and keeps clients on the latest code.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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
    })
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
    })
  )
})
