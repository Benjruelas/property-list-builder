import { uidsMatch } from './access'
import { DEV_USER_A, DEV_USER_B } from './devPersona'

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

function memberDisplayLabel(member) {
  if (!member) return null
  return labelFromEmail(member.email) || member.displayName || null
}

function findTeamMember(teams, ownerId) {
  if (!ownerId || !Array.isArray(teams)) return null
  for (const team of teams) {
    if (team?.ownerId && uidsMatch(team.ownerId, ownerId)) {
      const member = team.members?.find((m) => uidsMatch(m.uid, ownerId))
      return memberDisplayLabel(member) || labelFromEmail(team.ownerEmail) || 'Team owner'
    }
    const member = team.members?.find((m) => uidsMatch(m.uid, ownerId))
    if (member) return memberDisplayLabel(member)
  }
  return null
}

export function isLeadOwnedByCurrentUser(lead, currentUser) {
  if (!lead || !currentUser?.uid) return false
  return uidsMatch(lead.ownerId, currentUser.uid)
}

/** Human-readable label for the user who created / owns the lead. */
export function displayLeadOwnerLabel(lead, { teams = [] } = {}) {
  if (!lead) return null
  const ownerId = lead.ownerId

  if (ownerId && DEV_UID_LABELS[ownerId]) return DEV_UID_LABELS[ownerId]

  const fromTeam = findTeamMember(teams, ownerId)
  if (fromTeam) return fromTeam

  const fromEmail = labelFromEmail(lead.ownerEmail)
  if (fromEmail) return fromEmail

  return null
}
