/**
 * Pending team invites — KV store team_invites (global array).
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

const KV_KEY = 'team_invites'
let fallback = []

async function getAllInvites() {
  if (!kvAvailable || !kv) return fallback
  try {
    const data = await kv.get(KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : []) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallback = result
    return result
  } catch {
    return fallback
  }
}

async function saveAllInvites(list) {
  fallback = list
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, list).catch(() => kv.set(KV_KEY, JSON.stringify(list)))
  } catch (e) {
    console.warn('team invites save failed', e.message)
  }
}

export async function getInvitesForTeam(teamId) {
  const all = await getAllInvites()
  return all.filter((i) => i.teamId === teamId && i.status === 'pending')
}

export async function getInvitesForEmail(email) {
  const e = (email || '').toLowerCase().trim()
  const all = await getAllInvites()
  return all.filter((i) => i.email === e && i.status === 'pending')
}

export async function createInvite({ teamId, teamName, email, invitedByUid, invitedByEmail }) {
  const normalized = (email || '').toLowerCase().trim()
  if (!teamId || !normalized) return null
  const all = await getAllInvites()
  const existing = all.find(
    (i) => i.teamId === teamId && i.email === normalized && i.status === 'pending'
  )
  if (existing) return existing

  const invite = {
    id: `tinv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    teamId,
    teamName: teamName || 'Team',
    email: normalized,
    invitedByUid,
    invitedByEmail,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
  all.push(invite)
  await saveAllInvites(all)
  return invite
}

export async function findInviteById(inviteId) {
  const all = await getAllInvites()
  return all.find((i) => i.id === inviteId) || null
}

export async function updateInviteStatus(inviteId, status) {
  const all = await getAllInvites()
  const idx = all.findIndex((i) => i.id === inviteId)
  if (idx === -1) return null
  all[idx] = { ...all[idx], status, updatedAt: new Date().toISOString() }
  await saveAllInvites(all)
  return all[idx]
}

export async function cancelInvitesForTeamEmail(teamId, email) {
  const e = (email || '').toLowerCase().trim()
  const all = await getAllInvites()
  let changed = false
  for (const inv of all) {
    if (inv.teamId === teamId && inv.email === e && inv.status === 'pending') {
      inv.status = 'cancelled'
      inv.updatedAt = new Date().toISOString()
      changed = true
    }
  }
  if (changed) await saveAllInvites(all)
}
