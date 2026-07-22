/**
 * Build map GeoJSON and parcel-color maps from leads.
 */

import { getLeadStatus } from './leadStatuses'
import { getLeadStatusMapColor } from './leadStatusMapColors'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function toCoordNumber(value) {
  if (value == null || value === '') return NaN
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : NaN
}

function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180
  )
}

function dealCountFor(lead, dealCountByLead) {
  if (!lead?.id) return 0
  if (dealCountByLead?.get) return dealCountByLead.get(lead.id) || 0
  if (dealCountByLead && typeof dealCountByLead === 'object') {
    return dealCountByLead[lead.id] || 0
  }
  return 0
}

/** Point FeatureCollection for lead map overlay (primary lat/lng only). */
export function buildLeadMapGeoJSON(leads, { dealCountByLead = null, leadStatuses = null } = {}) {
  const features = []
  for (const lead of leads || []) {
    if (!lead?.id) continue
    const lat = toCoordNumber(lead.lat)
    const lng = toCoordNumber(lead.lng)
    if (!isValidCoord(lat, lng)) continue
    const dealCount = dealCountFor(lead, dealCountByLead)
    const statusId = getLeadStatus(lead, dealCount, leadStatuses)
    const color = getLeadStatusMapColor(statusId, leadStatuses)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        leadId: lead.id,
        statusId,
        color,
        weight: 1,
        parcelId: lead.parcelId != null ? String(lead.parcelId) : '',
      },
    })
  }
  if (!features.length) return EMPTY_FC
  return { type: 'FeatureCollection', features }
}

/** parcelId → status hex for parcel boundary fill highlights. */
export function buildLeadParcelColors(leads, { dealCountByLead = null, leadStatuses = null } = {}) {
  const map = new Map()
  for (const lead of leads || []) {
    if (lead?.parcelId == null || lead.parcelId === '') continue
    const dealCount = dealCountFor(lead, dealCountByLead)
    const statusId = getLeadStatus(lead, dealCount, leadStatuses)
    const color = getLeadStatusMapColor(statusId, leadStatuses)
    map.set(String(lead.parcelId), color)
  }
  return map
}

/** Distinct status colors present in a lead GeoJSON FeatureCollection. */
export function distinctLeadMapColors(geojson) {
  const colors = new Set()
  for (const f of geojson?.features || []) {
    const c = f?.properties?.color
    if (typeof c === 'string' && c) colors.add(c)
  }
  return [...colors]
}
