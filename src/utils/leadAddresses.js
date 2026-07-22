function normalizeAddressKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function syncPrimaryFlags(details) {
  if (!details.length) return []
  if (details.some((d) => d.primary)) return details
  return details.map((d, i) => ({ ...d, primary: i === 0 }))
}

function dedupeAddressDetails(details) {
  const out = []
  const seen = new Set()
  for (const detail of details) {
    if (!detail?.value) continue
    const key = normalizeAddressKey(detail.value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(detail)
  }
  return out
}

export function normalizeAddressDetail(detail) {
  const value = String(detail?.value ?? detail?.address ?? '').trim()
  if (!value) return null
  const latRaw = detail?.lat ?? null
  const lngRaw = detail?.lng ?? null
  const lat = latRaw == null || latRaw === '' ? null : Number(latRaw)
  const lng = lngRaw == null || lngRaw === '' ? null : Number(lngRaw)
  return {
    value,
    parcelId: detail?.parcelId || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    properties: detail?.properties ?? null,
    primary: detail?.primary === true,
  }
}

export function leadAddressFieldsFromDetails(addressDetails) {
  const addresses = syncPrimaryFlags(dedupeAddressDetails(addressDetails))
  const primary = addresses.find((d) => d.primary) || addresses[0] || null
  return {
    addressDetails: addresses,
    address: primary?.value ?? '',
    parcelId: primary?.parcelId ?? null,
    lat: primary?.lat ?? null,
    lng: primary?.lng ?? null,
    properties: primary?.properties ?? null,
  }
}

export function getLeadAddressDetails(lead) {
  if (!lead) return []
  if (Array.isArray(lead.addressDetails) && lead.addressDetails.length > 0) {
    return syncPrimaryFlags(
      lead.addressDetails.map((d) => normalizeAddressDetail(d)).filter(Boolean),
    )
  }
  const legacy = normalizeAddressDetail({
    value: lead.address,
    parcelId: lead.parcelId,
    lat: lead.lat,
    lng: lead.lng,
    properties: lead.properties,
    primary: true,
  })
  return legacy ? [legacy] : []
}

export function addressDetailCoords(detail) {
  const lat = Number(detail?.lat ?? detail?.properties?.LATITUDE ?? detail?.properties?.latitude)
  const lng = Number(detail?.lng ?? detail?.properties?.LONGITUDE ?? detail?.properties?.longitude)
  return { lat, lng }
}

export function addressDetailHasMap(detail) {
  if (!detail?.value?.trim()) return false
  const { lat, lng } = addressDetailCoords(detail)
  return !!(detail.parcelId || (Number.isFinite(lat) && Number.isFinite(lng)))
}

export function addressDetailHasCoords(detail) {
  const { lat, lng } = addressDetailCoords(detail)
  return Number.isFinite(lat) && Number.isFinite(lng)
}

export function formatAddressDetailDisplay(detail) {
  if (!detail) return ''
  const addr = String(detail.value || '').trim()
  if (!addr) return ''
  const p = detail.properties
  if (p) {
    const city = p.scity || p.PROP_CITY || p.SITUS_CITY || p.CITY || ''
    const state = p.state2 || p.PROP_STATE || p.SITUS_STATE || p.STATE || ''
    const street = p.STREET || p.ADDR_LINE1 || p.saddstr || ''
    if (street.trim() && (city || state)) {
      return [street.trim(), city, state].filter(Boolean).join(', ')
    }
  }
  return addr
}

export function addressDetailToParcelData(detail, lead = null) {
  if (!detail) return null
  const { lat, lng } = addressDetailCoords(detail)
  return {
    id: detail.parcelId,
    parcelId: detail.parcelId,
    leadId: lead?.id ?? null,
    address: detail.value,
    properties: detail.properties || {
      SITUS_ADDR: detail.value || '',
      LATITUDE: Number.isFinite(lat) ? lat : '',
      LONGITUDE: Number.isFinite(lng) ? lng : '',
      ...(detail.parcelId ? { PROP_ID: detail.parcelId } : {}),
    },
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }
}

export function hasLeadAddressInput(input) {
  if (!input || typeof input !== 'object') return false
  if (Array.isArray(input.addressDetails)) return true
  return input.address !== undefined
    || input.parcelId !== undefined
    || input.lat !== undefined
    || input.lng !== undefined
    || input.properties !== undefined
}

export function normalizeLeadAddressesForStorage(input = {}, existing = null) {
  if (Array.isArray(input.addressDetails)) {
    const details = input.addressDetails
      .map((d) => normalizeAddressDetail(d))
      .filter(Boolean)
    return leadAddressFieldsFromDetails(details)
  }

  if (input.address !== undefined
    || input.parcelId !== undefined
    || input.lat !== undefined
    || input.lng !== undefined
    || input.properties !== undefined) {
    const detail = normalizeAddressDetail({
      value: input.address ?? existing?.address ?? '',
      parcelId: input.parcelId !== undefined ? (input.parcelId || null) : (existing?.parcelId ?? null),
      lat: input.lat !== undefined ? input.lat : (existing?.lat ?? null),
      lng: input.lng !== undefined ? input.lng : (existing?.lng ?? null),
      properties: input.properties !== undefined ? input.properties : (existing?.properties ?? null),
      primary: true,
    })
    return leadAddressFieldsFromDetails(detail ? [detail] : [])
  }

  if (existing) {
    if (Array.isArray(existing.addressDetails) && existing.addressDetails.length > 0) {
      return leadAddressFieldsFromDetails(
        existing.addressDetails.map((d) => normalizeAddressDetail(d)).filter(Boolean),
      )
    }
    const legacy = normalizeAddressDetail({
      value: existing.address,
      parcelId: existing.parcelId,
      lat: existing.lat,
      lng: existing.lng,
      properties: existing.properties,
      primary: true,
    })
    return leadAddressFieldsFromDetails(legacy ? [legacy] : [])
  }

  return leadAddressFieldsFromDetails([])
}

const emptyAddressEntry = {
  value: '',
  parcelId: null,
  lat: null,
  lng: null,
  properties: null,
  primary: false,
}

export function addressDetailsForLeadForm(lead) {
  const details = getLeadAddressDetails(lead)
  return details.length ? details : [{ ...emptyAddressEntry }]
}

export function addressDetailsFromForm(form) {
  const details = (form.addressDetails || [])
    .map((d) => normalizeAddressDetail(d))
    .filter(Boolean)
  return leadAddressFieldsFromDetails(details)
}
