/**
 * List parcel normalization and add-delta helpers.
 * Clients often PATCH the full membership array; activity counts must use the delta.
 */

export function normalizeParcel(p) {
  if (typeof p === 'string') return { id: p, addedAt: new Date().toISOString() }
  if (p && p.id) {
    return {
      id: p.id,
      properties: p.properties || {},
      address: p.address || null,
      lat: p.lat || null,
      lng: p.lng || null,
      addedAt: p.addedAt || new Date().toISOString(),
    }
  }
  return null
}

/** Newly added parcels only — filters out ids already on the list. */
export function parcelsToAdd(existingParcels, incomingParcels) {
  if (!Array.isArray(incomingParcels) || incomingParcels.length === 0) return []
  const existingIds = new Set((existingParcels || []).map((p) => p.id || p))
  return incomingParcels.map(normalizeParcel).filter((p) => p && !existingIds.has(p.id))
}
