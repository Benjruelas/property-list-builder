import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { getLeadPhones, getLeadEmails } from '@/utils/leadContact'

export const ENTITY_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-0.5 w-full text-left px-3.5 py-3 rounded-lg border transition-all cursor-pointer'

export function filterLeads(leads, query) {
  const q = (query || '').toLowerCase().trim()
  const sorted = [...(leads || [])].sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  )
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((lead) => {
    const name = displayLeadName(lead).toLowerCase()
    const address = (lead.address || '').toLowerCase()
    const searchable = [
      name,
      address,
      ...getLeadEmails(lead),
      ...getLeadPhones(lead),
    ].filter(Boolean).join(' ').toLowerCase()
    return tokens.every((tok) => searchable.includes(tok))
  })
}

/** Deals linked to a lead (by leadId or shared parcelId). */
export function filterDealsForLead(deals, lead) {
  if (!lead?.id) return deals || []
  return (deals || []).filter((d) => {
    if (d.leadId === lead.id) return true
    if (lead.parcelId && d.parcelId && String(d.parcelId) === String(lead.parcelId)) return true
    return false
  })
}

export function filterDeals(deals, query) {
  const q = (query || '').toLowerCase().trim()
  const sorted = [...(deals || [])].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((deal) => {
    const title = (deal.title || '').toLowerCase()
    const leadName = (deal.leadName || '').toLowerCase()
    const leadAddress = (deal.leadAddress || '').toLowerCase()
    const searchable = [title, leadName, leadAddress].filter(Boolean).join(' ')
    return tokens.every((tok) => searchable.includes(tok))
  })
}

export function dealPrimaryLabel(deal) {
  return (deal?.title || deal?.leadName || deal?.leadAddress || deal?.id || 'Deal').trim()
}

export function dealSecondaryLabel(deal) {
  const leadName = (deal?.leadName || '').trim()
  const leadAddress = (deal?.leadAddress || '').trim()
  if (leadName && leadAddress && leadName !== leadAddress) return `${leadName} · ${leadAddress}`
  return leadAddress || leadName || ''
}

export function dealPipelineLabel(deal) {
  return (deal?.__pipelineTitle || '').trim() || null
}

export function filterTeamMembers(members, query) {
  const q = (query || '').toLowerCase().trim()
  const sorted = [...(members || [])].sort((a, b) =>
    (a.email || a.uid || '').localeCompare(b.email || b.uid || '')
  )
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((member) => {
    const searchable = [member.email, member.uid, member.displayName, member.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return tokens.every((tok) => searchable.includes(tok))
  })
}

export function memberPrimaryLabel(member) {
  return (member?.displayName || member?.name || member?.email || member?.uid || 'Member').trim()
}

export function memberSecondaryLabel(member) {
  const primary = memberPrimaryLabel(member)
  const email = (member?.email || '').trim()
  const name = (member?.displayName || member?.name || '').trim()
  if (email && email !== primary) return email
  if (name && name !== primary) return name
  return ''
}

export function memberInitials(member) {
  const name = (member?.displayName || member?.name || '').trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  const email = (member?.email || '').trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

export { displayLeadName, formatLeadAddress }
