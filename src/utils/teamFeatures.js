/**
 * Per-member feature access for team members (admins always have full access).
 */

export const TEAM_FEATURE_IDS = [
  'pipes',
  'tasks',
  'schedule',
  'activity',
  'lists',
  'paths',
  'outreach',
  'leads',
  'deals',
  'forms',
  'quotes',
]

export const TEAM_FEATURE_LABELS = {
  pipes: 'Pipes',
  tasks: 'Tasks',
  schedule: 'Schedule',
  activity: 'Activity',
  lists: 'Lists',
  paths: 'Paths',
  outreach: 'Outreach',
  leads: 'Leads',
  deals: 'Deals',
  forms: 'Forms',
  quotes: 'Quotes',
}

export function defaultMemberFeatures() {
  return Object.fromEntries(TEAM_FEATURE_IDS.map((id) => [id, true]))
}

export function normalizeMemberFeatures(raw) {
  const out = defaultMemberFeatures()
  if (!raw || typeof raw !== 'object') return out
  for (const id of TEAM_FEATURE_IDS) {
    if (typeof raw[id] === 'boolean') out[id] = raw[id]
  }
  return out
}

export function resolveTeamMemberFeatures(membership, teams, currentUser) {
  if (!membership || !currentUser?.uid) return null
  if (membership.role === 'admin') return defaultMemberFeatures()
  if (membership.features) return normalizeMemberFeatures(membership.features)

  const team = (teams || []).find((t) => t.id === membership.teamId)
  const member = team?.members?.find((m) => m.uid === currentUser.uid)
  return normalizeMemberFeatures(member?.features)
}

export function canAccessTeamFeature(membership, features, featureId) {
  if (!membership) return true
  if (membership.role === 'admin') return true
  if (!features) return true
  return features[featureId] !== false
}

export const TEAM_FEATURE_ACCESS_DENIED_MESSAGE = "Don't have access to this feature"

/** Map feed / notification nav payloads to a team feature id. */
export function featureIdForFeedNav(data) {
  if (!data || typeof data !== 'object') return null
  if (data.panel === 'quotes') return 'quotes'
  const type = String(data.type || '').toLowerCase()
  if (!type) return null
  if (type === 'lead') return 'leads'
  if (type === 'deal' || type === 'pipelinedealstage') return 'deals'
  if (type === 'pipeline' || type === 'pipelineshared' || type === 'pipelineleadstage') return 'pipes'
  if (type.startsWith('task')) return 'tasks'
  if (type === 'schedule') return 'schedule'
  if (type.includes('list')) return 'lists'
  if (type.includes('path')) return 'paths'
  if (type.includes('form')) return 'forms'
  if (type.includes('quote')) return 'quotes'
  if (type.includes('team')) return null
  return null
}
