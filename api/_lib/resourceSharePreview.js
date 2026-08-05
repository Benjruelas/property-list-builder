/**
 * Surface-level fields for share link OG cards and preview payloads.
 * Always uses the first address / phone / email when multiples exist.
 */

function firstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
    if (c != null && typeof c !== 'object' && String(c).trim()) return String(c).trim()
  }
  return ''
}

function firstAddressFromLead(lead) {
  if (!lead) return { address: '', lat: null, lng: null, parcelId: null }
  const details = Array.isArray(lead.addressDetails) ? lead.addressDetails : []
  const primary = details.find((d) => d?.primary) || details[0] || null
  const address = firstString(primary?.value, lead.address)
  const lat = Number.isFinite(Number(primary?.lat))
    ? Number(primary.lat)
    : (Number.isFinite(Number(lead.lat)) ? Number(lead.lat) : null)
  const lng = Number.isFinite(Number(primary?.lng))
    ? Number(primary.lng)
    : (Number.isFinite(Number(lead.lng)) ? Number(lead.lng) : null)
  const parcelId = firstString(primary?.parcelId, lead.parcelId) || null
  return { address, lat, lng, parcelId }
}

function firstPhoneFromLead(lead) {
  if (!lead) return ''
  const details = Array.isArray(lead.phoneDetails) ? lead.phoneDetails : []
  const primary = details.find((d) => d?.primary) || details[0]
  if (primary?.value) return String(primary.value).trim()
  if (Array.isArray(lead.phones) && lead.phones[0]) return String(lead.phones[0]).trim()
  return firstString(lead.phone)
}

function firstEmailFromLead(lead) {
  if (!lead) return ''
  const details = Array.isArray(lead.emailDetails) ? lead.emailDetails : []
  const primary = details.find((d) => d?.primary) || details[0]
  if (primary?.value) return String(primary.value).trim()
  if (Array.isArray(lead.emails) && lead.emails[0]) return String(lead.emails[0]).trim()
  return firstString(lead.email)
}

export function displayLeadName(lead) {
  if (!lead) return ''
  const first = firstString(lead.firstName)
  const last = firstString(lead.lastName)
  const combined = [first, last].filter(Boolean).join(' ').trim()
  return combined || 'Lead'
}

export function buildLeadSharePreview(lead) {
  const { address, lat, lng, parcelId } = firstAddressFromLead(lead)
  const name = displayLeadName(lead)
  return {
    resourceType: 'lead',
    name,
    title: name,
    address,
    phone: firstPhoneFromLead(lead),
    email: firstEmailFromLead(lead),
    lat,
    lng,
    parcelId,
  }
}

export function buildDealSharePreview(deal, lead) {
  const leadPreview = buildLeadSharePreview(lead)
  const title = firstString(deal?.title) || leadPreview.name || 'Deal'
  const address = firstString(deal?.leadAddress, leadPreview.address)
  const lat = leadPreview.lat
  const lng = leadPreview.lng
  // Prefer deal parcel if lead has none; coords still come from lead when available.
  const parcelId = leadPreview.parcelId || firstString(deal?.parcelId) || null
  return {
    resourceType: 'deal',
    name: leadPreview.name,
    title,
    address,
    phone: leadPreview.phone,
    email: leadPreview.email,
    lat,
    lng,
    parcelId,
  }
}

export function previewDescription(preview) {
  if (!preview) return 'Shared on KnockScout'
  const parts = []
  if (preview.resourceType === 'deal' && preview.title && preview.title !== preview.name) {
    parts.push(preview.title)
  }
  if (preview.address) parts.push(preview.address)
  if (preview.phone) parts.push(preview.phone)
  if (preview.email) parts.push(preview.email)
  return parts.join(' · ') || 'Shared on KnockScout'
}
