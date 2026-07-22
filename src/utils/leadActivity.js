/**
 * Lead CRM activity timeline — append entries and status updates.
 */

import { updateLead, loadLocalLeads, saveLocalLeads, getLeadStatusMeta } from './leads'
import { getPostContactStatusId } from './leadStatuses'

import { getApiBase } from './apiBase'

const MAX_LEAD_ACTIVITY = 200

export function buildActivityEntry(type, summary, meta = {}) {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    at: new Date().toISOString(),
    summary: String(summary || '').trim().slice(0, 500),
    meta: meta && typeof meta === 'object' ? meta : {},
  }
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

export async function setLeadStatus(getToken, leadId, status, { logActivity = true, fromStatus, leadStatuses } = {}) {
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
        { from: fromStatus, to: status }
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
      buildActivityEntry('status', `Status changed to ${meta.label}`, { from: fromStatus, to: status })
    )
  }
  return lead
}

/** Auto-bump new → next outreach status on first contact. */
export async function bumpLeadStatusOnContact(getToken, lead, currentEffectiveStatus, leadStatuses) {
  if (!lead?.id || currentEffectiveStatus !== 'new') return lead
  const nextStatus = getPostContactStatusId(leadStatuses)
  if (!nextStatus) return lead
  return setLeadStatus(getToken, lead.id, nextStatus, { fromStatus: 'new', leadStatuses })
}

export async function logLeadOutreach(getToken, leadId, type, phoneOrEmail) {
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
  return appendLeadActivity(getToken, leadId, buildActivityEntry(type, summary, meta))
}

export async function logLeadDealCreated(getToken, leadId, dealTitle, dealId) {
  return appendLeadActivity(
    getToken,
    leadId,
    buildActivityEntry('deal', `Deal created: ${dealTitle || 'Untitled'}`, { dealId })
  )
}

export async function logLeadPhotosAdded(getToken, leadId, count = 1) {
  const n = Math.max(1, Number(count) || 1)
  const summary = n === 1 ? 'Photo added' : `${n} photos added`
  return appendLeadActivity(getToken, leadId, buildActivityEntry('photo', summary, { count: n }))
}

export async function logLeadReportEvent(getToken, leadId, summary, meta = {}) {
  return appendLeadActivity(getToken, leadId, buildActivityEntry('report', summary, meta))
}

export async function logLeadFormSent(getToken, leadId, summary, meta = {}) {
  return appendLeadActivity(getToken, leadId, buildActivityEntry('form', summary, meta))
}

export function sortActivitiesNewestFirst(lead) {
  const activities = Array.isArray(lead?.activity) ? [...lead.activity] : []
  return activities.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

