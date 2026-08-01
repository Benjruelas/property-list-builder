/**
 * Resolve the Settings "Your name" (appSettings.profile.displayName) for a user.
 * Used for activity attribution, client communications, and document branding.
 */

import { kv, kvAvailable } from './kvBootstrap.js'

function userDataKey(uid) {
  return `user_data_${uid}`
}

async function getUserDataBlob(uid) {
  if (!uid || !kvAvailable || !kv) return null
  try {
    const data = await kv.get(userDataKey(uid))
    if (!data) return null
    if (typeof data === 'string') return JSON.parse(data)
    return data
  } catch {
    return null
  }
}

/** @param {string|null|undefined} uid */
export async function resolveProfileDisplayName(uid) {
  if (!uid) return ''
  try {
    const data = await getUserDataBlob(uid)
    return String(data?.appSettings?.profile?.displayName || '').trim()
  } catch {
    return ''
  }
}

/**
 * Attach Settings "Your name" onto a user object when displayName is missing.
 * @param {{ uid?: string, email?: string, displayName?: string }|null} user
 */
export async function enrichUserWithProfileName(user) {
  if (!user?.uid) return user
  if (String(user.displayName || '').trim()) return user
  const name = await resolveProfileDisplayName(user.uid)
  return name ? { ...user, displayName: name } : user
}
