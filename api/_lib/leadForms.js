import { getAllInvites, getAllSubmissions, getAllTemplates } from './formInvites.js'
import { fullTeamsIndex, resolveAccess } from './teams.js'

function inviteStatusLabel(invite) {
  if (invite.status === 'submitted') return 'completed'
  if (invite.status === 'pending' && invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return 'expired'
  }
  if (invite.status === 'revoked' || invite.status === 'expired') return invite.status
  if (invite.status === 'pending' && invite.viewTracking?.firstViewedAt) return 'viewed'
  return 'pending'
}

/**
 * List form invites and submissions tied to a lead, visible to the current user.
 */
export async function listLeadFormActivityForUser(leadId, user, allTeams) {
  const normalizedLeadId = String(leadId || '').trim()
  if (!normalizedLeadId) return []

  const [invites, submissions, templates] = await Promise.all([
    getAllInvites(),
    getAllSubmissions(),
    getAllTemplates(),
  ])
  const teamsIndex = fullTeamsIndex(allTeams)
  const templateById = new Map(templates.map((t) => [t.id, t]))
  const visibleTemplateIds = new Set(
    templates.filter((t) => resolveAccess(t, user, teamsIndex)).map((t) => t.id),
  )

  const items = []

  for (const invite of invites) {
    if (String(invite.leadId || '') !== normalizedLeadId) continue
    if (!visibleTemplateIds.has(invite.templateId)) continue
    const template = templateById.get(invite.templateId)
    items.push({
      id: invite.id,
      kind: 'invite',
      templateId: invite.templateId,
      templateName: template?.name || 'Form',
      status: inviteStatusLabel(invite),
      at: invite.submittedAt || invite.viewTracking?.lastViewedAt || invite.createdAt,
      viewedAt: invite.viewTracking?.firstViewedAt || null,
      recipientEmail: invite.recipientEmail || null,
      recipientPhone: invite.recipientPhone || null,
      inviteId: invite.id,
    })
  }

  for (const submission of submissions) {
    if (String(submission.leadId || '') !== normalizedLeadId) continue
    if (!visibleTemplateIds.has(submission.templateId)) continue
    const template = templateById.get(submission.templateId)
    items.push({
      id: submission.id,
      kind: 'submission',
      templateId: submission.templateId,
      templateName: template?.name || 'Form',
      status: submission.source === 'public_link' ? 'completed' : 'sent',
      at: submission.submittedAt,
      recipientEmail: submission.recipientEmail || null,
      recipientPhone: submission.recipientPhone || null,
      submissionId: submission.id,
    })
  }

  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
  return items
}
