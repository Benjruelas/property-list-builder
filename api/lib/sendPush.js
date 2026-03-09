/**
 * Server-side push notification helper.
 * Sends FCM messages to users by uid or email.
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON, KV (for user_data and email_uid mapping)
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

let adminInitialized = false
let messaging = null

function getMessaging() {
  if (messaging) return messaging
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!sa) return null
  try {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app')
    const { getMessaging: getMsg } = await import('firebase-admin/messaging')
    if (!getApps().length) {
      const cred = typeof sa === 'string' ? JSON.parse(sa) : sa
      initializeApp({ credential: cert(cred) })
    }
    messaging = getMsg()
    adminInitialized = true
    return messaging
  } catch (e) {
    console.warn('Firebase Admin init failed:', e.message)
    return null
  }
}

/** Get full user data by uid */
export async function getUserData(uid) {
  if (!kvAvailable || !kv || !uid) return null
  try {
    const data = await kv.get(`user_data_${uid}`)
    if (!data) return null
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch (e) {
    console.warn('getUserData failed:', e.message)
    return null
  }
}

/** Get fcmToken for a user by uid */
export async function getFcmTokenForUser(uid) {
  const data = await getUserData(uid)
  return data?.fcmToken || null
}

/** Get uid for an email (KV mapping first, then Firebase Admin lookup) */
export async function getUidForEmail(email) {
  if (!email) return null
  const norm = String(email).toLowerCase().trim()
  if (!norm) return null

  // 1. Check KV mapping (populated when user hits user-data/lists)
  if (kvAvailable && kv) {
    try {
      const uid = await kv.get(`email_uid_${norm}`)
      if (uid) return uid
    } catch (e) {
      console.warn('getUidForEmail KV failed:', e.message)
    }
  }

  // 2. Fallback: look up via Firebase Admin (for users who have an account but haven't hit user-data yet)
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!sa) return null
  try {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app')
    const { getAuth } = await import('firebase-admin/auth')
    if (!getApps().length) {
      const cred = typeof sa === 'string' ? JSON.parse(sa) : sa
      initializeApp({ credential: cert(cred) })
    }
    const auth = getAuth()
    const userRecord = await auth.getUserByEmail(norm)
    const uid = userRecord?.uid
    if (uid && kvAvailable && kv) {
      await setEmailUidMapping(norm, uid)
    }
    return uid || null
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') {
      console.warn('getUidForEmail Firebase lookup failed:', e?.message || e)
    }
    return null
  }
}

/** Store email->uid mapping (call when user is verified) */
export async function setEmailUidMapping(email, uid) {
  if (!kvAvailable || !kv || !email || !uid) return
  try {
    const key = `email_uid_${String(email).toLowerCase().trim()}`
    await kv.set(key, uid)
  } catch (e) {
    console.warn('setEmailUidMapping failed:', e.message)
  }
}

/** Check if user wants push notifications (default true if unset for backwards compat) */
function wantsNotificationType(userData, type) {
  if (!userData) return true
  if (userData.pushNotificationsEnabled === false) return false
  if (type === 'export') return userData.pushExportReady !== false
  if (type === 'share') return userData.pushListShared !== false
  if (type === 'pipelineShare') return userData.pushPipelineShared !== false
  if (type === 'taskReminder') return userData.pushTaskReminders !== false
  return true
}

/**
 * Send push notification to a user by uid.
 * @param {string} uid - Firebase user id
 * @param {{ title: string, body?: string, type?: 'export'|'share' }} payload
 * @returns {Promise<boolean>} true if sent
 */
export async function sendPushToUser(uid, { title, body = '', type }) {
  const userData = await getUserData(uid)
  if (!userData?.fcmToken) return false
  if (!wantsNotificationType(userData, type)) return false
  const msg = getMessaging()
  if (!msg) return false
  try {
    await msg.send({
      token: userData.fcmToken,
      notification: { title, body },
      webpush: { fcmOptions: { link: '/' } }
    })
    return true
  } catch (e) {
    console.warn('sendPushToUser failed:', e.message)
    return false
  }
}

/**
 * Send push notification to a user by email (looks up uid first).
 * @param {string} email - User email
 * @param {{ title: string, body?: string, type?: 'export'|'share' }} payload
 * @returns {Promise<boolean>} true if sent
 */
export async function sendPushToEmail(email, { title, body = '', type }) {
  const uid = await getUidForEmail(email)
  if (!uid) {
    console.warn(`push not sent: no uid for email ${email} (recipient must have signed in; check KV + Firebase Admin)`)
    return false
  }
  const userData = await getUserData(uid)
  if (!userData?.fcmToken) {
    console.warn(`push not sent: no fcmToken for ${email} (recipient must enable push in Settings)`)
    return false
  }
  if (!wantsNotificationType(userData, type)) {
    console.warn(`push not sent: ${email} has disabled ${type} notifications`)
    return false
  }
  const msg = getMessaging()
  if (!msg) {
    console.warn('push not sent: FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid')
    return false
  }
  try {
    await msg.send({
      token: userData.fcmToken,
      notification: { title, body },
      webpush: { fcmOptions: { link: '/' } }
    })
    return true
  } catch (e) {
    console.warn('sendPushToUser failed:', e.message)
    return false
  }
}
