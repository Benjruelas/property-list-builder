import { displayLeadName, formatLeadAddress } from '@/utils/leads'

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
    const email = (lead.email || '').toLowerCase()
    const phone = (lead.phone || '').toLowerCase()
    const searchable = [name, address, email, phone].filter(Boolean).join(' ')
    return tokens.every((tok) => searchable.includes(tok))
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

export { displayLeadName, formatLeadAddress }
