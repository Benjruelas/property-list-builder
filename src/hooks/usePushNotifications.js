/**
 * Hook for Firebase Cloud Messaging (FCM) web push notifications.
 * Requests permission, gets FCM token, and saves it to the backend.
 */

import { useState, useEffect, useCallback } from 'react'
import { getMessaging, getToken as getFCMToken, onMessage } from 'firebase/messaging'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''

function getApiBase() {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

const PROMPT_DONE_KEY = 'push_first_prompt_done'

/** Whether we've already shown the first-time push prompt this session/ever */
export function hasPromptedForPush() {
  try {
    return !!localStorage.getItem(PROMPT_DONE_KEY)
  } catch {
    return false
  }
}

/** Mark that we've shown the first-time push prompt */
export function setPromptedForPush() {
  try {
    localStorage.setItem(PROMPT_DONE_KEY, '1')
  } catch {}
}

/** Check if push is supported (browser, HTTPS, service worker) */
export function isPushSupported() {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  if (location.protocol !== 'https:' && !location.hostname.includes('localhost')) return false
  return true
}

/** Check if we're in a context where FCM can run (not in dev bypass) */
function canUseFCM(currentUser, isDev) {
  if (isDev && currentUser?.email === 'dev@localhost') return false
  if (!currentUser?.uid) return false
  return true
}

/**
 * @param {Object} options
 * @param {Object} options.currentUser - Firebase auth user
 * @param {() => Promise<string|null>} options.getAuthToken - Auth token getter
 * @param {boolean} [options.isDev] - Dev mode (skip FCM)
 * @param {boolean} [options.enabled] - User preference to enable push
 */
export function usePushNotifications({ currentUser, getAuthToken, isDev = false, enabled = true }) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const requestPermission = useCallback(async () => {
    if (!isPushSupported()) {
      setError('Push notifications are not supported in this browser')
      return false
    }
    if (!VAPID_KEY) {
      setError('Push notifications are not configured. Add VITE_FIREBASE_VAPID_KEY.')
      return false
    }
    setLoading(true)
    setError(null)
    try {
      const p = await Notification.requestPermission()
      setPermission(p)
      if (p !== 'granted') {
        setError(p === 'denied' ? 'Notifications were denied' : 'Permission not granted')
        return false
      }
      return true
    } catch (e) {
      setError(e.message || 'Failed to request permission')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const registerToken = useCallback(async () => {
    if (!currentUser?.uid || !getAuthToken || !enabled) return
    if (!isPushSupported() || !VAPID_KEY) return
    if (Notification.permission !== 'granted') return

    try {
      const messaging = getMessaging()
      const fcmToken = await getFCMToken(messaging, { vapidKey: VAPID_KEY })
      if (!fcmToken) return

      setToken(fcmToken)

      const authToken = await getAuthToken()
      if (!authToken) return

      const res = await fetch(`${getApiBase()}/user-data`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ fcmToken })
      })
      if (!res.ok) throw new Error('Failed to save push token')
    } catch (e) {
      console.warn('Push registration failed:', e.message)
      setError(e.message)
    }
  }, [currentUser?.uid, getAuthToken, enabled])

  /** Unsubscribe from push and clear backend token. Call when user disables push. */
  const disablePush = useCallback(async () => {
    if (!currentUser?.uid || !getAuthToken) return
    setToken(null)
    setError(null)
    try {
      // Unsubscribe from PushManager so re-enabling will create a fresh subscription (and prompt if needed)
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      }
    } catch (e) {
      console.warn('Push unsubscribe failed:', e.message)
    }
    try {
      const authToken = await getAuthToken()
      if (authToken) {
        await fetch(`${getApiBase()}/user-data`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ fcmToken: null })
        })
      }
    } catch (e) {
      console.warn('Clear fcmToken failed:', e.message)
    }
  }, [currentUser?.uid, getAuthToken])

  // Request permission and register when user enables and is signed in
  useEffect(() => {
    if (!canUseFCM(currentUser, isDev) || !enabled) return
    if (!isPushSupported() || !VAPID_KEY) return

    let cancelled = false

    const run = async () => {
      if (Notification.permission === 'granted') {
        await registerToken()
        return
      }
      if (Notification.permission === 'denied') {
        setPermission('denied')
        return
      }
      // default - don't auto-request; user must click Enable in Settings
    }

    run().catch((e) => {
      if (!cancelled) setError(e.message)
    })

    return () => { cancelled = true }
  }, [currentUser?.uid, enabled, isDev, registerToken])

  // Listen for foreground messages
  useEffect(() => {
    if (!canUseFCM(currentUser, isDev) || !enabled || !isPushSupported()) return

    try {
      const messaging = getMessaging()
      const unsub = onMessage(messaging, (payload) => {
        if (payload?.notification?.title) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(payload.notification.title, {
              body: payload.notification.body,
              icon: payload.notification.icon || '/icon-192.svg'
            })
          }
        }
      })
      return () => unsub()
    } catch {
      return undefined
    }
  }, [currentUser?.uid, enabled, isDev])

  const enablePush = useCallback(async () => {
    const ok = await requestPermission()
    if (ok) await registerToken()
    return ok
  }, [requestPermission, registerToken])

  return {
    permission,
    token,
    error,
    loading,
    supported: isPushSupported(),
    configured: !!VAPID_KEY,
    requestPermission,
    enablePush,
    disablePush,
    registerToken
  }
}

/**
 * First-time push prompt: request permission, and if granted enable push and register token.
 * Call when app opens for the first time with a signed-in user.
 * @param {{ getAuthToken: () => Promise<string|null>, currentUser: { uid: string, email?: string } | null }} opts
 * @returns {Promise<boolean>} true if permission granted and registered
 */
export async function promptAndRegisterPushOnFirstLoad({ getAuthToken, currentUser }) {
  if (!currentUser?.uid || !getAuthToken) return false
  if (currentUser?.email === 'dev@localhost') return false
  if (!isPushSupported()) {
    if (import.meta.env.DEV) console.warn('[push] First-time prompt skipped: push not supported (need HTTPS or localhost, Notification, PushManager)')
    return false
  }
  if (!VAPID_KEY) {
    if (import.meta.env.DEV) console.warn('[push] First-time prompt skipped: VITE_FIREBASE_VAPID_KEY not set in .env.local')
    return false
  }
  if (Notification.permission !== 'default') {
    if (import.meta.env.DEV) console.warn('[push] First-time prompt skipped: permission already', Notification.permission, '(clear in browser site settings to retest)')
    return false
  }
  if (hasPromptedForPush()) {
    if (import.meta.env.DEV) console.warn('[push] First-time prompt skipped: already prompted (clear localStorage push_first_prompt_done to retest)')
    return false
  }

  setPromptedForPush()
  try {
    const p = await Notification.requestPermission()
    if (p !== 'granted') return false
    const { saveSettings } = await import('../utils/settings')
    const { syncPushPreferences } = await import('../utils/userDataSync')
    saveSettings({ pushNotificationsEnabled: true })
    const authToken = await getAuthToken()
    if (!authToken) return true
    const messaging = getMessaging()
    const fcmToken = await getFCMToken(messaging, { vapidKey: VAPID_KEY })
    if (!fcmToken) return true
    const res = await fetch(`${getApiBase()}/user-data`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ fcmToken })
    })
    if (!res.ok) return true
    syncPushPreferences(getAuthToken)
    return true
  } catch {
    return false
  }
}
