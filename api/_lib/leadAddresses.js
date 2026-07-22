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

function normalizeAddressDetail(detail) {
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

function leadAddressFieldsFromDetails(addressDetails) {
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
