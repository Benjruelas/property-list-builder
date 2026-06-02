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

/** Per-member visibility flags (not panel access). */
export const TEAM_MEMBER_VISIBILITY_IDS = ['dealAmounts']

export const TEAM_MEMBER_VISIBILITY_LABELS = {
  dealAmounts: 'Can see deal amounts',
}

export function normalizeMemberFeatures(raw) {
  const out = defaultMemberFeatures()
  for (const id of TEAM_MEMBER_VISIBILITY_IDS) {
    out[id] = true
  }
  if (!raw || typeof raw !== 'object') return out
  for (const id of TEAM_FEATURE_IDS) {
    if (typeof raw[id] === 'boolean') out[id] = raw[id]
  }
  for (const id of TEAM_MEMBER_VISIBILITY_IDS) {
    if (typeof raw[id] === 'boolean') out[id] = raw[id]
  }
  return out
}

export function isTeamAdminMember(member, team, uid) {
  if (!member || !team || !uid) return false
  if (team.ownerId === uid) return true
  return member.role === 'admin' || member.role === 'owner'
}

export function resolveMemberFeatures(member, team, uid) {
  if (!member) return defaultMemberFeatures()
  if (isTeamAdminMember(member, team, uid)) return defaultMemberFeatures()
  return normalizeMemberFeatures(member.features)
}

export function memberCanUseFeature(features, featureId) {
  if (!featureId) return true
  if (!features) return true
  return features[featureId] !== false
}
