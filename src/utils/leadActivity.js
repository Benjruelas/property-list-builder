/**
 * Lead CRM activity timeline — append entries and status updates.
 */

import { updateLead, loadLocalLeads, saveLocalLeads, getLeadStatusMeta } from './leads'
import { getPostContactStatusId } from './leadStatuses'
import { uidsMatch } from './access'
import { DEV_USER_A, DEV_USER_B } from './devPersona'

import { getApiBase } from './apiBase'

const MAX_LEAD_ACTIVITY = 200

const DEV_UID_LABELS = {
  [DEV_USER_A.uid]: DEV_USER_A.displayName,
  [DEV_USER_B.uid]: DEV_USER_B.displayName,
}

function labelFromEmail(email) {
  const trimmed = String(email || '').trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]
    if (!local) return trimmed
    return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return trimmed
}

function findTeamMemberLabel(teams, uid) {
  if (!uid || !Array.isArray(teams)) return null
  for (const team of teams) {
    if (team?.ownerId && uidsMatch(team.ownerId, uid)) {
      const member = team.members?.find((m) => uidsMatch(m.uid, uid))
      return labelFromEmail(member?.email) || member?.displayName || labelFromEmail(team.ownerEmail) || 'Team owner'
    }
    const member = team.members?.find((m) => uidsMatch(m.uid, uid))
    if (member) return labelFromEmail(member.email) || member.displayName || null
  }
  return null
}

/** Stamp actor fields onto an activity entry when a user is known. */
export function withActivityActor(entry, actor) {
  if (!entry || !actor?.uid) return entry
  const next = { ...entry, byUid: actor.uid }
  const email = String(actor.email || '').trim().toLowerCase()
  if (email) next.byEmail = email
  const name = String(actor.displayName || '').trim().slice(0, 120)
  if (name) next.byName = name
  return next
}

export function buildActivityEntry(type, summary, meta = {}, actor = null) {
  const entry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    at: new Date().toISOString(),
    summary: String(summary || '').trim().slice(0, 500),
    meta: meta && typeof meta === 'object' ? meta : {},
  }
  return withActivityActor(entry, actor)
}

/** Human-readable label for who performed a lead activity entry. */
export function displayActivityActorLabel(entry, { teams = [], currentUserId = null } = {}) {
  if (!entry) return null
  if (entry.byUid && currentUserId && uidsMatch(entry.byUid, currentUserId)) return 'You'
  if (entry.byUid && DEV_UID_LABELS[entry.byUid]) return DEV_UID_LABELS[entry.byUid]
  const fromTeam = findTeamMemberLabel(teams, entry.byUid)
  if (fromTeam) return fromTeam
  const fromName = String(entry.byName || '').trim()
  if (fromName) return fromName
  return labelFromEmail(entry.byEmail)
}

export async function appendLeadActivity(getToken, leadId, entry) {
  const token = await getToken?.()
  if (!token) {
    const leads = loadLocalLeads()
    const idx = leads.findIndex((l) => l.id === leadId)
    if (idx === -1) throw new Error('Lead not found')
    const activities = [...(leads[idx].activity || []), entry]
    const lead = {
      ...leads[idx],
      activity: activities.length > MAX_LEAD_ACTIVITY ? activities.slice(-MAX_LEAD_ACTIVITY) : activities,
      updatedAt: new Date().toISOString(),
    }
    leads[idx] = lead
    saveLocalLeads(leads)
    return lead
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId, action: 'append-activity', entry }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to log activity')
  }
  const data = await res.json()
  return data.lead
}

export async function setLeadStatus(getToken, leadId, status, { logActivity = true, fromStatus, leadStatuses, actor = null } = {}) {
  const now = new Date().toISOString()
  const meta = getLeadStatusMeta(status, leadStatuses)
  const updates = { status, statusUpdatedAt: now }

  const token = await getToken?.()
  if (!token) {
    const leads = loadLocalLeads()
    const idx = leads.findIndex((l) => l.id === leadId)
    if (idx === -1) throw new Error('Lead not found')
    let lead = { ...leads[idx], ...updates, updatedAt: now }
    if (logActivity && fromStatus !== status) {
      const entry = buildActivityEntry(
        'status',
        `Status changed to ${meta.label}`,
        { from: fromStatus, to: status },
        actor,
      )
      const activities = [...(lead.activity || []), entry]
      lead = {
        ...lead,
        activity: activities.length > MAX_LEAD_ACTIVITY ? activities.slice(-MAX_LEAD_ACTIVITY) : activities,
      }
    }
    leads[idx] = lead
    saveLocalLeads(leads)
    return lead
  }

  let lead = await updateLead(getToken, leadId, updates)
  if (logActivity && fromStatus !== status) {
    lead = await appendLeadActivity(
      getToken,
      leadId,
      buildActivityEntry('status', `Status changed to ${meta.label}`, { from: fromStatus, to: status }, actor)
    )
  }
  return lead
}

/** Auto-bump new → next outreach status on first contact. */
export async function bumpLeadStatusOnContact(getToken, lead, currentEffectiveStatus, leadStatuses, actor = null) {
  if (!lead?.id || currentEffectiveStatus !== 'new') return lead
  const nextStatus = getPostContactStatusId(leadStatuses)
  if (!nextStatus) return lead
  return setLeadStatus(getToken, lead.id, nextStatus, { fromStatus: 'new', leadStatuses, actor })
}

export async function logLeadOutreach(getToken, leadId, type, phoneOrEmail, actor = null) {
  const summaries = {
    call: 'Called from app',
    text: 'Texted from app',
    email: 'Emailed from app',
  }
  const summary = summaries[type] || 'Outreach from app'
  const meta = {}
  if (phoneOrEmail) {
    meta[type === 'email' ? 'email' : 'phone'] = phoneOrEmail
  }
  return appendLeadActivity(getToken, leadId, buildActivityEntry(type, summary, meta, actor))
}

export async function logLeadDealCreated(getToken, leadId, dealTitle, dealId, actor = null) {
  return appendLeadActivity(
    getToken,
    leadId,
    buildActivityEntry('deal', `Deal created: ${dealTitle || 'Untitled'}`, { dealId }, actor)
  )
}

export async function logLeadPhotosAdded(getToken, leadId, count = 1, actor = null) {
  const n = Math.max(1, Number(count) || 1)
  const summary = n === 1 ? 'Photo added' : `${n} photos added`
  return appendLeadActivity(getToken, leadId, buildActivityEntry('photo', summary, { count: n }, actor))
}

export async function logLeadReportEvent(getToken, leadId, summary, meta = {}, actor = null) {
  return appendLeadActivity(getToken, leadId, buildActivityEntry('report', summary, meta, actor))
}

export async function logLeadFormSent(getToken, leadId, summary, meta = {}, actor = null) {
  return appendLeadActivity(getToken, leadId, buildActivityEntry('form', summary, meta, actor))
}

export function sortActivitiesNewestFirst(lead) {
  const activities = Array.isArray(lead?.activity) ? [...lead.activity] : []
  return activities.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}
