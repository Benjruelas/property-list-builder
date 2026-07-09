/**
 * Vercel Serverless Function - Teams v2
 *
 * GET    -> teams + membership + pendingInvites for user
 * POST   -> create team (admin, team pipe, settings)
 * PATCH  -> invite-member | accept-invite | decline-invite | promote-admin |
 *           demote-admin | update-settings | update-member-features | rename | remove-member | transfer-owner
 * DELETE -> delete team (admin only)
 */

import { authenticate } from './lib/auth.js'
import { normalizeEmailBranding } from './lib/senderBranding.js'
import {
  getAllTeams,
  saveAllTeams,
  loadTeamsForUser,
  lookupFirebaseUidByEmail,
  DEFAULT_SEAT_LIMIT,
} from './lib/teams.js'
import { isTeamAdmin, getTeamMemberRole, userHasTeamMembership } from './lib/access.js'
import {
  createInvite,
  findInviteById,
  updateInviteStatus,
  getInvitesForEmail,
  getInvitesForTeam,
  cancelInvitesForTeamEmail,
} from './lib/teamInvites.js'
import { createTeamPipeline } from './lib/teamPipeline.js'
import { mutateLeads } from './lib/leadStore.js'
import { mutatePipelines } from './lib/pipelineStoreFull.js'
import {
  normalizeMemberFeatures,
  resolveMemberFeatures,
  isTeamAdminMember,
} from './lib/teamFeatures.js'
import { normalizeLeadStatuses } from './lib/leadStatuses.js'

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

async function stripTeamIdFromAllResources(teamId) {
  if (!kvAvailable || !kv) return

  await mutateLeads((arr) => {
    let changed = false
    for (const r of arr) {
      if (Array.isArray(r.teamShares) && r.teamShares.includes(teamId)) {
        r.teamShares = r.teamShares.filter((id) => id !== teamId)
        changed = true
      }
      if (r.teamId === teamId && r.visibility === 'team') {
        r.visibility = 'private'
        r.teamId = null
        changed = true
      }
    }
    return changed ? [...arr] : undefined
  })

  await mutatePipelines((arr) => {
    let changed = false
    for (const r of arr) {
      if (Array.isArray(r.teamShares) && r.teamShares.includes(teamId)) {
        r.teamShares = r.teamShares.filter((id) => id !== teamId)
        changed = true
      }
      if (r.teamId === teamId && r.visibility === 'team') {
        r.visibility = 'private'
        r.teamId = null
        changed = true
      }
    }
    return changed ? [...arr] : undefined
  })

  for (const key of ['user_lists', 'user_paths', 'user_form_templates']) {
    try {
      const d = await kv.get(key)
      const rows = typeof d === 'string' ? (d ? JSON.parse(d) : []) : d
      const arr = Array.isArray(rows) ? rows : []
      let changed = false
      for (const r of arr) {
        if (Array.isArray(r.teamShares) && r.teamShares.includes(teamId)) {
          r.teamShares = r.teamShares.filter((id) => id !== teamId)
          changed = true
        }
        if (r.teamId === teamId && r.visibility === 'team') {
          r.visibility = 'private'
          r.teamId = null
          changed = true
        }
      }
      if (changed) {
        await kv.set(key, arr).catch(() => kv.set(key, JSON.stringify(arr)))
      }
    } catch (e) {
      console.warn(`strip teamId from ${key} failed`, e.message)
    }
  }
}

function normalizeMember(m, team) {
  const role = m.role === 'owner' ? 'admin' : (m.role === 'admin' ? 'admin' : 'member')
  const base = {
    uid: m.uid,
    email: m.email,
    role,
    joinedAt: m.joinedAt || m.addedAt,
    addedBy: m.addedBy,
  }
  if (team && role === 'member') {
    base.features = resolveMemberFeatures(m, team, m.uid)
  }
  return base
}

function normalizeTeamForWire(team, viewerUid) {
  const members = (team.members || []).map((m) => normalizeMember(m, team))
  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    ownerEmail: team.ownerEmail,
    members,
    plan: team.plan || 'pro',
    seatLimit: team.seatLimit || DEFAULT_SEAT_LIMIT,
    allowExternalSharing: team.allowExternalSharing === true,
    membersCanSeeDealAmounts: team.membersCanSeeDealAmounts !== false,
    emailBranding: normalizeEmailBranding(team.emailBranding || {}),
    leadStatuses: team.leadStatuses?.length ? normalizeLeadStatuses(team.leadStatuses) : null,
    teamPipelineId: team.teamPipelineId || null,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    viewerRole: viewerUid ? getTeamMemberRole(team, viewerUid) : null,
  }
}

function requireAdmin(team, user) {
  return isTeamAdmin(team, user.uid)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user, allowDevBypass, idToken } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const all = await getAllTeams()
      const teams = loadTeamsForUser(all, user.uid).map((t) => normalizeTeamForWire(t, user.uid))
      const membership = userHasTeamMembership(all, user.uid)
      const pendingInvites = await getInvitesForEmail(user.email)
      const memberRecord = membership
        ? (membership.members || []).find((m) => m.uid === user.uid)
        : null
      const memberRole = membership ? getTeamMemberRole(membership, user.uid) : null
      return res.status(200).json({
        teams,
        membership: membership
          ? {
              teamId: membership.id,
              teamName: membership.name,
              role: memberRole,
              teamPipelineId: membership.teamPipelineId || null,
              allowExternalSharing: membership.allowExternalSharing === true,
              membersCanSeeDealAmounts: membership.membersCanSeeDealAmounts !== false,
              leadStatuses: membership.leadStatuses?.length
                ? normalizeLeadStatuses(membership.leadStatuses)
                : null,
              features: resolveMemberFeatures(memberRecord, membership, user.uid),
            }
          : null,
        pendingInvites,
      })
    }

    if (method === 'POST') {
      const { name } = body
      const trimmed = (name || '').trim()
      if (!trimmed) return res.status(400).json({ error: 'Team name is required' })
      if (trimmed.length > 80) return res.status(400).json({ error: 'Team name is too long' })

      const all = await getAllTeams()
      if (userHasTeamMembership(all, user.uid)) {
        return res.status(400).json({ error: 'You can only belong to one team. Leave your current team first.' })
      }

      const now = new Date().toISOString()
      const newTeam = {
        id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: trimmed,
        ownerId: user.uid,
        ownerEmail: user.email,
        members: [
          {
            uid: user.uid,
            email: user.email,
            role: 'admin',
            joinedAt: now,
            addedBy: user.uid,
          },
        ],
        plan: 'pro',
        seatLimit: DEFAULT_SEAT_LIMIT,
        allowExternalSharing: false,
        membersCanSeeDealAmounts: true,
        teamPipelineId: null,
        createdAt: now,
        updatedAt: now,
      }

      if (kvAvailable && kv) {
        const pipe = await createTeamPipeline(kv, newTeam, user)
        if (pipe?.id) newTeam.teamPipelineId = pipe.id
      }

      all.push(newTeam)
      await saveAllTeams(all)
      return res.status(201).json({ team: normalizeTeamForWire(newTeam, user.uid) })
    }

    if (method === 'PATCH') {
      const { teamId, action, inviteId } = body
      if (!action) return res.status(400).json({ error: 'action is required' })

      const all = await getAllTeams()

      if (action === 'accept-invite') {
        const inv = inviteId
          ? await findInviteById(inviteId)
          : (await getInvitesForEmail(user.email)).find((i) => i.teamId === teamId)
        if (!inv || inv.status !== 'pending') {
          return res.status(404).json({ error: 'Invite not found or expired' })
        }
        if (inv.email !== (user.email || '').toLowerCase().trim()) {
          return res.status(403).json({ error: 'This invite is for a different email' })
        }
        if (userHasTeamMembership(all, user.uid)) {
          return res.status(400).json({ error: 'Leave your current team before accepting a new invite' })
        }
        const idx = all.findIndex((t) => t.id === inv.teamId)
        if (idx === -1) return res.status(404).json({ error: 'Team not found' })
        const team = all[idx]
        const seatLimit = team.seatLimit || DEFAULT_SEAT_LIMIT
        if ((team.members || []).length >= seatLimit) {
          return res.status(400).json({ error: `Seat limit reached (${seatLimit})` })
        }
        const now = new Date().toISOString()
        team.members = [
          ...(team.members || []),
          { uid: user.uid, email: user.email, role: 'member', joinedAt: now, addedBy: inv.invitedByUid },
        ]
        team.updatedAt = now
        all[idx] = team
        await saveAllTeams(all)
        await updateInviteStatus(inv.id, 'accepted')
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'decline-invite') {
        const inv = inviteId
          ? await findInviteById(inviteId)
          : (await getInvitesForEmail(user.email)).find((i) => i.teamId === teamId)
        if (!inv) return res.status(404).json({ error: 'Invite not found' })
        if (inv.email !== (user.email || '').toLowerCase().trim()) {
          return res.status(403).json({ error: 'Not your invite' })
        }
        await updateInviteStatus(inv.id, 'declined')
        return res.status(200).json({ message: 'Invite declined' })
      }

      if (!teamId) return res.status(400).json({ error: 'teamId is required' })

      const idx = all.findIndex((t) => t.id === teamId)
      if (idx === -1) return res.status(404).json({ error: 'Team not found' })
      const team = all[idx]
      const isAdmin = requireAdmin(team, user)
      const selfMember = (team.members || []).find((m) => m.uid === user.uid)

      if (action === 'rename') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can rename the team' })
        const newName = (body.name || '').trim()
        if (!newName) return res.status(400).json({ error: 'Name cannot be empty' })
        team.name = newName
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'update-settings') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can update team settings' })
        if (body.allowExternalSharing !== undefined) {
          team.allowExternalSharing = body.allowExternalSharing === true
        }
        if (body.membersCanSeeDealAmounts !== undefined) {
          team.membersCanSeeDealAmounts = body.membersCanSeeDealAmounts === true
        }
        if (body.emailBranding !== undefined) {
          team.emailBranding = normalizeEmailBranding(body.emailBranding)
        }
        if (body.leadStatuses !== undefined) {
          team.leadStatuses = normalizeLeadStatuses(body.leadStatuses)
        }
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'update-member-features') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can update member features' })
        const targetUid = body.uid
        if (!targetUid) return res.status(400).json({ error: 'uid is required' })
        const targetIdx = (team.members || []).findIndex((m) => m.uid === targetUid)
        if (targetIdx === -1) return res.status(404).json({ error: 'Member not found' })
        const target = team.members[targetIdx]
        if (isTeamAdminMember(target, team, targetUid)) {
          return res.status(400).json({ error: 'Admins always have full access' })
        }
        team.members[targetIdx] = {
          ...target,
          features: normalizeMemberFeatures(body.features),
        }
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'invite-member' || action === 'add-member') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can invite members' })
        const email = (body.email || '').toLowerCase().trim()
        if (!email || !email.includes('@')) {
          return res.status(400).json({ error: 'Valid email is required' })
        }
        if ((team.members || []).some((m) => (m.email || '').toLowerCase() === email)) {
          return res.status(400).json({ error: 'That user is already on the team' })
        }
        const resolved = await lookupFirebaseUidByEmail(email, { allowDevBypass, idToken })
        if (resolved) {
          const existingTeam = userHasTeamMembership(all, resolved.uid)
          if (existingTeam && existingTeam.id !== teamId) {
            return res.status(400).json({ error: 'User is already on another team' })
          }
        }
        const invite = await createInvite({
          teamId: team.id,
          teamName: team.name,
          email,
          invitedByUid: user.uid,
          invitedByEmail: user.email,
        })
        try {
          const { notifyTeamMemberAdded } = await import('./lib/pushUtils.js')
          await notifyTeamMemberAdded(email, {
            teamName: team.name,
            teamId: team.id,
            actorEmail: user.email,
          })
        } catch {
          /* ignore */
        }
        const pending = await getInvitesForTeam(team.id)
        return res.status(200).json({ invite, pendingInvites: pending, team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'promote-admin') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can promote members' })
        const targetUid = body.uid
        if (!targetUid) return res.status(400).json({ error: 'uid is required' })
        team.members = (team.members || []).map((m) =>
          m.uid === targetUid ? { ...m, role: 'admin' } : m
        )
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'demote-admin') {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can demote members' })
        const targetUid = body.uid
        if (targetUid === team.ownerId) {
          return res.status(400).json({ error: 'Cannot demote the team creator' })
        }
        if (targetUid === user.uid) {
          return res.status(400).json({ error: 'Cannot demote yourself' })
        }
        team.members = (team.members || []).map((m) =>
          m.uid === targetUid ? { ...m, role: 'member' } : m
        )
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'remove-member') {
        const targetUid = body.uid
        if (!targetUid) return res.status(400).json({ error: 'uid is required' })
        const selfRemove = targetUid === user.uid
        if (!isAdmin && !selfRemove) {
          return res.status(403).json({ error: 'Only admins can remove other members' })
        }
        if (targetUid === team.ownerId) {
          return res.status(400).json({ error: 'Cannot remove the team creator' })
        }
        const removedMember = (team.members || []).find((m) => m.uid === targetUid)
        if (!removedMember) return res.status(404).json({ error: 'Member not found' })
        team.members = (team.members || []).filter((m) => m.uid !== targetUid)
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        if (removedMember?.email) {
          await cancelInvitesForTeamEmail(team.id, removedMember.email)
        }
        try {
          const { logTeamActivity, actorLabel } = await import('./lib/activityLog.js')
          await logTeamActivity({
            teamIds: [team.id],
            actor: user,
            type: 'team.member_removed',
            summary: `${actorLabel(user)} removed ${removedMember?.email || 'a member'} from team "${team.name}"`,
            entity: { kind: 'team', teamId: team.id },
            nav: { type: 'team', teamId: team.id },
            audience: 'resource_viewers',
          })
        } catch {
          /* ignore */
        }
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (action === 'transfer-owner') {
        if (team.ownerId !== user.uid) {
          return res.status(403).json({ error: 'Only the team creator can transfer ownership' })
        }
        const toUid = body.toUid
        const target = (team.members || []).find((m) => m.uid === toUid)
        if (!target) return res.status(404).json({ error: 'Member not found' })
        team.ownerId = target.uid
        team.ownerEmail = target.email
        team.members = (team.members || []).map((m) => {
          if (m.uid === target.uid) return { ...m, role: 'admin' }
          return m
        })
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team, user.uid) })
      }

      if (!selfMember && !isAdmin) {
        return res.status(403).json({ error: 'Not a team member' })
      }
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    if (method === 'DELETE') {
      const { teamId } = body
      if (!teamId) return res.status(400).json({ error: 'teamId is required' })
      const all = await getAllTeams()
      const idx = all.findIndex((t) => t.id === teamId)
      if (idx === -1) return res.status(404).json({ error: 'Team not found' })
      const team = all[idx]
      if (!requireAdmin(team, user)) {
        return res.status(403).json({ error: 'Only admins can delete this team' })
      }
      await stripTeamIdFromAllResources(team.id)
      all.splice(idx, 1)
      await saveAllTeams(all)
      return res.status(200).json({ message: 'Team deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('teams API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
