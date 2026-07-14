/**
 * Resolve sender display name + team business branding for outbound client emails.
 */

import { getAllTeams, loadTeamsForUser } from './teams.js'

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

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function normalizeLogoBase64(logo) {
  if (!logo || typeof logo !== 'string') return ''
  const s = logo.trim()
  if (!s.startsWith('data:image/')) return ''
  if (s.length > 400_000) return ''
  return s
}

/** @param {object} input */
export function normalizeEmailBranding(input) {
  if (!input || typeof input !== 'object') {
    return {
      businessName: '',
      companyPhone: '',
      companyWebsite: '',
      companyEmail: '',
      logoBase64: '',
    }
  }
  return {
    businessName: String(input.businessName || '').trim().slice(0, 120),
    companyPhone: String(input.companyPhone || '').trim().slice(0, 40),
    companyWebsite: String(input.companyWebsite || '').trim().slice(0, 200),
    companyEmail: String(input.companyEmail || '').trim().slice(0, 120),
    logoBase64: normalizeLogoBase64(input.logoBase64),
  }
}

/**
 * @param {{ uid: string, email?: string }} user
 */
export async function resolveSenderBranding(user) {
  const data = await getUserDataBlob(user.uid)
  const appSettings = data?.appSettings || {}
  const profileName = (appSettings?.profile?.displayName || '').trim()
  const emailLocal = (user.email || '').split('@')[0] || ''
  const senderName = profileName || emailLocal || 'Your representative'

  const allTeams = await getAllTeams()
  const userTeams = loadTeamsForUser(allTeams, user.uid)
  const team = userTeams[0]
  const eb = normalizeEmailBranding(team?.emailBranding || {})
  const businessName = eb.businessName || (team?.name || '').trim() || 'KnockScout'

  return {
    senderName,
    senderEmail: user.email || '',
    businessName,
    companyPhone: eb.companyPhone,
    companyWebsite: eb.companyWebsite,
    companyEmail: eb.companyEmail,
    logoBase64: eb.logoBase64,
  }
}

/**
 * Resolve who should appear as the sender on a client-facing quote/report.
 * When senderUid is provided and differs from the acting user, both must share a team.
 *
 * @param {{ actingUser: { uid: string, email?: string }, senderUid?: string | null }} params
 * @returns {Promise<{ uid: string, email: string, branding: Awaited<ReturnType<typeof resolveSenderBranding>>, error?: string, status?: number }>}
 */
export async function resolveSendAsSender({ actingUser, senderUid = null }) {
  const requested = String(senderUid || '').trim()
  if (!requested || requested === actingUser.uid) {
    const branding = await resolveSenderBranding(actingUser)
    return {
      uid: actingUser.uid,
      email: actingUser.email || branding.senderEmail || '',
      branding,
    }
  }

  const allTeams = await getAllTeams()
  const actorTeams = loadTeamsForUser(allTeams, actingUser.uid)
  let memberEmail = ''
  let shared = false
  for (const team of actorTeams) {
    const member = (team.members || []).find((m) => m.uid === requested)
    if (member) {
      shared = true
      memberEmail = (member.email || '').trim()
      break
    }
  }
  if (!shared) {
    return { uid: '', email: '', branding: null, error: 'Sender must be a teammate', status: 403 }
  }

  const branding = await resolveSenderBranding({ uid: requested, email: memberEmail })
  return {
    uid: requested,
    email: memberEmail || branding.senderEmail || '',
    branding,
  }
}

/**
 * Prefer invite/document sender snapshot, then fall back to owner branding.
 */
export async function resolvePublicDocumentBranding({
  ownerId,
  ownerEmail = '',
  invite = null,
  document = null,
  createdByName = '',
} = {}) {
  const sentByUid = invite?.sentByUid || document?.lastSentByUid || ''
  const sentByEmail = invite?.sentByEmail || document?.lastSentByEmail || ''
  const sentByName = invite?.sentByName || document?.lastSentByName || createdByName || ''

  const uid = sentByUid || ownerId
  if (!uid) return null

  try {
    const branding = await resolveSenderBranding({
      uid,
      email: sentByEmail || ownerEmail || '',
    })
    return {
      businessName: branding.businessName,
      logoBase64: branding.logoBase64,
      senderName: sentByName || branding.senderName,
      senderEmail: sentByEmail || branding.senderEmail || ownerEmail || '',
    }
  } catch {
    return null
  }
}

/**
 * @param {{ branding: object, bodyHtml: string }} params
 */
export function buildBrandedEmailHtml({ branding, bodyHtml }) {
  const {
    businessName,
    logoBase64,
    companyPhone,
    companyWebsite,
    companyEmail,
    senderName,
    senderEmail,
  } = branding

  const footerParts = []
  if (senderName) footerParts.push(senderName)
  const contactEmail = companyEmail || senderEmail
  if (contactEmail) footerParts.push(contactEmail)
  if (companyPhone) footerParts.push(companyPhone)
  if (companyWebsite) footerParts.push(companyWebsite)

  const logoBlock = logoBase64
    ? `<img src="${logoBase64}" alt="" width="200" style="max-height:48px;max-width:200px;height:auto;display:block;margin-bottom:12px;" />`
    : ''

  const footerHtml = footerParts.length
    ? footerParts.map((p) => escapeHtml(p)).join(' &middot; ')
    : ''

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
<tr>
<td style="padding:24px 28px;border-bottom:1px solid #e4e4e7;">
${logoBlock}
<div style="font-size:18px;font-weight:600;color:#18181b;line-height:1.3;">${escapeHtml(businessName)}</div>
</td>
</tr>
<tr>
<td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#3f3f46;">
${bodyHtml}
</td>
</tr>
${
  footerHtml
    ? `<tr>
<td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;line-height:1.5;">
${footerHtml}
</td>
</tr>`
    : ''
}
</table>
</body>
</html>`
}

/** Prefer business name in Resend "from" display when env from is "Name <addr>". */
export function buildFromAddress(defaultFrom, businessName) {
  const from = String(defaultFrom || '').trim()
  const name = String(businessName || '').trim()
  if (!name || !from) return from
  const match = from.match(/^(.+?)\s*<([^>]+)>$/)
  if (match) {
    return `${name} <${match[2].trim()}>`
  }
  if (from.includes('@')) {
    return `${name} <${from}>`
  }
  return from
}
