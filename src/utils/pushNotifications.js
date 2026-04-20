/**
 * Web Push subscription + local notification helpers.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * @param {() => Promise<string|null>} getToken
 * @returns {Promise<boolean>}
 */
export async function subscribeToWebPush(getToken) {
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapid || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  const token = await getToken()
  if (!token) return false

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid)
  })

  const res = await fetch(`${getApiBase()}/push-subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ subscription: sub.toJSON() })
  })
  return res.ok
}

/**
 * @param {() => Promise<string|null>} getToken
 */
export async function unsubscribeWebPush(getToken) {
  const token = await getToken()
  if (!token) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  await fetch(`${getApiBase()}/push-subscribe`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {})
}

/**
 * Show a local notification (skip trace, deadlines) when permission granted.
 */
export async function showLocalNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      ...options
    })
  } catch {
    try {
      new Notification(title, options)
    } catch {
      /* ignore */
    }
  }
}
