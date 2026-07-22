import { fetchLandRecordsParcel } from './fetchLandRecordsParcel'
import { resolveParcelId } from './parcelPropertyMap'
import { getFullAddress } from './dealPipeline'
import { buildLeadPrefillFromParcel } from './leads'
import { geocodeAddressForLead } from './geocodeAddress'

/** Normalize LandRecords API response into parcel-shaped data for leads. */
export function parcelDataFromLandRecords(apiResult, lat, lng) {
  if (!apiResult?.properties) return null
  const { properties } = apiResult
  const id = apiResult.parcelId || resolveParcelId({ properties, id: properties.PROP_ID })
  if (!id) return null

  const parcelLat = Number(properties.LATITUDE ?? lat)
  const parcelLng = Number(properties.LONGITUDE ?? lng)
  const parcelData = {
    id,
    properties,
    lat: Number.isFinite(parcelLat) ? parcelLat : lat,
    lng: Number.isFinite(parcelLng) ? parcelLng : lng,
  }
  parcelData.address = getFullAddress(parcelData)
  return parcelData
}

/** Resolve assessor parcel at coordinates (same source as map parcel clicks). */
export async function resolveLeadParcelAtLocation(lat, lng, { lrid, signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const result = await fetchLandRecordsParcel({ lat, lng, lrid, signal })
  return parcelDataFromLandRecords(result, lat, lng)
}

/** Merge resolved parcel fields into a lead form while preserving contact fields. */
export function mergeLeadFormWithParcel(form, parcelData, { addressIndex = 0 } = {}) {
  if (!parcelData) return form
  const prefill = buildLeadPrefillFromParcel(parcelData)
  if (!prefill.parcelId) return form

  const addressDetails = Array.isArray(form.addressDetails) && form.addressDetails.length
    ? form.addressDetails.map((entry, index) => {
      if (index !== addressIndex) return entry
      return {
        ...entry,
        value: prefill.address || entry.value,
        parcelId: prefill.parcelId,
        lat: prefill.lat ?? entry.lat,
        lng: prefill.lng ?? entry.lng,
        properties: prefill.properties ?? entry.properties,
      }
    })
    : prefill.addressDetails

  return {
    ...form,
    addressDetails,
    parcelId: prefill.parcelId,
    lat: prefill.lat ?? form.lat,
    lng: prefill.lng ?? form.lng,
    properties: prefill.properties ?? form.properties,
    address: prefill.address || form.address,
  }
}

/** Geocode when needed, then resolve parcel so scratch leads match parcel-created leads. */
export async function ensureLeadParcelLink(form, onResolveParcel) {
  let next = { ...form }

  if (!next.parcelId && (next.lat == null || next.lng == null) && next.address?.trim()) {
    const geo = await geocodeAddressForLead(next.address)
    if (geo) {
      next = {
        ...next,
        lat: geo.lat,
        lng: geo.lng,
        address: geo.address || next.address,
      }
    }
  }

  if (!next.parcelId && next.lat != null && next.lng != null && onResolveParcel) {
    const parcel = await onResolveParcel(next.lat, next.lng)
    next = mergeLeadFormWithParcel(next, parcel)
  }

  return next
}
