/**
 * List-view projection for leads — trims heavy fields while preserving list UI needs.
 */

const OUTREACH_TYPES = new Set(['call', 'text', 'email'])

export function computeLastContactedAt(lead) {
  const activities = Array.isArray(lead?.activity) ? lead.activity : []
  let latest = null
  for (const entry of activities) {
    if (!OUTREACH_TYPES.has(entry?.type) || !entry?.at) continue
    if (!latest || entry.at > latest) latest = entry.at
  }
  return latest
}

export function projectLeadForList(lead) {
  if (!lead || typeof lead !== 'object') return lead
  const activity = Array.isArray(lead.activity) ? lead.activity : []
  const photos = Array.isArray(lead.photos) ? lead.photos : []
  const { activity: _a, photos: _p, ...rest } = lead
  return {
    ...rest,
    activityCount: activity.length,
    lastContactedAt: computeLastContactedAt(lead),
    photoCount: photos.length,
    _listView: true,
  }
}

export function projectLeadsForList(leads) {
  return (Array.isArray(leads) ? leads : []).map(projectLeadForList)
}

export function isListViewLead(lead) {
  return !!lead?._listView
}

export default projectLeadsForList
