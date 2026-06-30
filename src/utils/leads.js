/**
 * User-scoped leads API client.
 */

import { splitOwnerName } from './ownerName'
import { getFullAddress } from './dealPipeline'
import { collectParcelIdCandidates, resolveParcelId } from './parcelPropertyMap'
import { formatPhoneDisplay, normalizePhoneForStorage } from './phoneFormat'
import {
  normalizeLeadContactsForStorage,
  getLeadPhones,
  getLeadEmails,
  leadContactMatchesQuery,
  skipTraceContactDetails,
} from './leadContact'
import { mergePhotoRecord } from './photoDisplay'
export {
  getLeadPhones,
  getLeadEmails,
  leadContactMatchesQuery,
} from './leadContact'

import { getApiBase } from './apiBase'

const LOCAL_LEADS_KEY = 'user_leads_local'
const MAX_LEAD_ACTIVITY = 200
let leadsListEtag = null

export function resetLeadsListEtag() {
  leadsListEtag = null
}

export {
  DEFAULT_LEAD_STATUSES,
  LEAD_STATUSES,
  getLeadStatusMeta,
  getLeadStatus,
} from './leadStatuses'

const OUTREACH_ACTIVITY_TYPES = new Set(['call', 'text', 'email'])

export function lastContactedAt(lead) {
  if (lead?.lastContactedAt) return lead.lastContactedAt
  const activities = Array.isArray(lead?.activity) ? lead.activity : []
  let latest = null
  for (const entry of activities) {
    if (!OUTREACH_ACTIVITY_TYPES.has(entry?.type) || !entry?.at) continue
    if (!latest || entry.at > latest) latest = entry.at
  }
  return latest
}

export function formatLastContacted(iso) {
  if (!iso) return null
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = Math.max(0, now - then)
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return 'Contacted today'
    if (diffDays === 1) return 'Contacted yesterday'
    return `Contacted ${diffDays}d ago`
  } catch {
    return null
  }
}

export function loadLocalLeads() {
  try {
    const stored = localStorage.getItem(LOCAL_LEADS_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalLeads(leads) {
  try {
    localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads))
  } catch (e) {
    console.error('Error saving local leads:', e)
  }
}

/** Merge poll payloads into existing client state without dropping heavy / in-flight fields. */
export function mergeLeadPhotos(prevPhotos, nextPhotos) {
  const prev = Array.isArray(prevPhotos) ? prevPhotos : []
  if (!Array.isArray(nextPhotos)) return prev
  const next = nextPhotos
  if (!prev.length) return next
  if (!next.length) return []

  const prevIds = new Set(prev.map((p) => p.id))
  const nextIds = new Set(next.map((p) => p.id))
  const isDeletion = next.length < prev.length
    && [...nextIds].every((id) => prevIds.has(id))

  if (isDeletion) {
    const byId = new Map(prev.map((p) => [p.id, p]))
    return next.map((p) => mergePhotoRecord(byId.get(p.id), p))
  }

  const byId = new Map(prev.map((p) => [p.id, p]))
  for (const p of next) {
    byId.set(p.id, mergePhotoRecord(byId.get(p.id), p))
  }

  const isPartialAddition = next.every((p) => !prevIds.has(p.id))
  if (isPartialAddition) {
    return Array.from(byId.values())
  }

  return next.map((p) => mergePhotoRecord(byId.get(p.id), p))
}

/** True when only the photos array (and updatedAt) changed — already persisted via /api/photos. */
export function isPhotosOnlyEntityChange(prev, next) {
  if (!prev || !next || prev.id !== next.id) return false
  const prevPhotos = JSON.stringify(prev.photos || [])
  const nextPhotos = JSON.stringify(next.photos || [])
  if (prevPhotos === nextPhotos) return false
  for (const key of Object.keys(next)) {
    if (key === 'photos' || key === 'updatedAt') continue
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) return false
  }
  return true
}

/** Merge a full lead fetch/detail payload onto existing client state. */
export function mergeLeadDetail(prev, incoming) {
  if (!incoming) return prev
  if (!prev) return incoming
  return {
    ...incoming,
    photos: mergeLeadPhotos(prev.photos, incoming.photos),
    files: incoming.files ?? prev.files,
    activity: incoming.activity ?? prev.activity,
  }
}

/** Merge one lead into the cached list and persist — used after /api/photos mutations. */
export function upsertLeadInLocalStore(leads, updated, merge = mergeLeadDetail) {
  const list = Array.isArray(leads) ? leads : []
  const next = list.map((lead) => (lead.id === updated.id ? merge(lead, updated) : lead))
  saveLocalLeads(next)
  return next
}

export function mergeListViewLeads(existing, incoming) {
  const prevById = new Map((Array.isArray(existing) ? existing : []).map((l) => [l.id, l]))
  return (Array.isArray(incoming) ? incoming : []).map((inc) => {
    const prev = prevById.get(inc.id)
    if (!prev) return inc
    if (inc?._listView) {
      const prevPhotos = prev.photos
      const serverPhotoCount = typeof inc.photoCount === 'number' ? inc.photoCount : null
      let photos = inc.photos
      if (photos == null && Array.isArray(prevPhotos)) {
        if (serverPhotoCount != null && prevPhotos.length !== serverPhotoCount) {
          photos = undefined
        } else {
          photos = prevPhotos
        }
      }
      return {
        ...inc,
        activity: prev.activity ?? inc.activity,
        photos,
        files: prev.files ?? inc.files,
      }
    }
    return inc
  })
}

export async function fetchLeads(getToken, { view = 'list', existingLeads } = {}) {
  const token = await getToken()
  if (!token) return loadLocalLeads()
  const headers = { Authorization: `Bearer ${token}` }
  if (leadsListEtag) headers['If-None-Match'] = leadsListEtag
  const query = view ? `?view=${encodeURIComponent(view)}` : ''
  const res = await fetch(`${getApiBase()}/leads${query}`, {
    method: 'GET',
    headers,
  })
  if (res.status === 304) return { notModified: true }
  if (!res.ok) throw new Error('Failed to fetch leads')
  const etag = res.headers.get('ETag')
  if (etag) leadsListEtag = etag.replace(/^W\//, '').replace(/"/g, '')
  const data = await res.json()
  const leads = data.leads || []
  const existing = Array.isArray(existingLeads) ? existingLeads : loadLocalLeads()
  const toStore = mergeListViewLeads(existing, leads)
  saveLocalLeads(toStore)
  return leads
}

export async function fetchLeadById(getToken, leadId) {
  const token = await getToken()
  if (!token || !leadId) return null
  const res = await fetch(`${getApiBase()}/leads?leadId=${encodeURIComponent(leadId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch lead')
  const data = await res.json()
  return data.lead || null
}

function withNormalizedLeadContact(data) {
  if (!data || typeof data !== 'object') return data
  const contact = normalizeLeadContactsForStorage(data)
  return { ...data, ...contact }
}

export async function createLead(getToken, leadData) {
  const normalizedData = withNormalizedLeadContact(leadData)
  const token = await getToken()
  if (!token) {
    const leads = loadLocalLeads()
    if (normalizedData.parcelId && leads.some((l) => l.parcelId === normalizedData.parcelId)) {
      throw new Error('A lead already exists for this parcel')
    }
    const now = new Date().toISOString()
    const lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      status: 'new',
      statusUpdatedAt: now,
      activity: [],
      ...normalizedData,
      createdAt: now,
      updatedAt: now,
    }
    saveLocalLeads([...leads, lead])
    return lead
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(normalizedData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create lead')
  }
  const data = await res.json()
  return data.lead
}

/** Strip owner/sharing fields when syncing a full lead record (e.g. after photo upload). */
export function toLeadPatchBody(updates, { includeSharing = false } = {}) {
  if (!updates || typeof updates !== 'object') return {}
  const skip = new Set(['id', 'ownerId', 'ownerEmail', 'createdAt'])
  if (!includeSharing) {
    skip.add('visibility')
    skip.add('sharedMemberUids')
    skip.add('teamShares')
    skip.add('sharedWith')
    skip.add('teamId')
  }
  const out = {}
  for (const [key, value] of Object.entries(updates)) {
    if (skip.has(key)) continue
    out[key] = value
  }
  return out
}

/** Photos are persisted via /api/photos; no leads PATCH needed for photo-only sync. */
export function isLeadPhotosOnlyPatch(payload) {
  const keys = Object.keys(payload)
  return keys.length > 0 && keys.every((k) => k === 'photos' || k === 'updatedAt')
}

export async function updateLead(getToken, leadId, updates) {
  const normalizedUpdates = withNormalizedLeadContact(updates)
  const token = await getToken()
  if (!token) {
    const leads = loadLocalLeads()
    const idx = leads.findIndex((l) => l.id === leadId)
    if (idx === -1) throw new Error('Lead not found')
    const lead = { ...leads[idx], ...normalizedUpdates, updatedAt: new Date().toISOString() }
    leads[idx] = lead
    saveLocalLeads(leads)
    return lead
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId, ...normalizedUpdates })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update lead')
  }
  const data = await res.json()
  return data.lead
}

export async function deleteLead(getToken, leadId) {
  const token = await getToken()
  if (!token) {
    saveLocalLeads(loadLocalLeads().filter((l) => l.id !== leadId))
    return
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete lead')
  }
}

function parcelIdCandidateSet(parcelOrId) {
  if (parcelOrId == null || parcelOrId === '') return new Set()
  if (typeof parcelOrId === 'object') {
    return new Set(collectParcelIdCandidates(parcelOrId).map((id) => String(id).trim()).filter(Boolean))
  }
  const s = String(parcelOrId).trim()
  return s ? new Set([s]) : new Set()
}

const LEAD_COORD_EPS = 1e-4

function collectLeadParcelIdCandidates(lead) {
  const ids = new Set()
  collectParcelIdCandidates(lead).forEach((id) => ids.add(id))
  collectParcelIdCandidates({
    id: lead?.parcelId,
    parcelId: lead?.parcelId,
    properties: lead?.properties,
  }).forEach((id) => ids.add(id))
  if (lead?.parcelId != null && lead.parcelId !== '') {
    ids.add(String(lead.parcelId).trim())
  }
  return ids
}

function extractParcelCoords(parcelOrId) {
  if (!parcelOrId || typeof parcelOrId !== 'object') return { lat: null, lng: null }
  const lat = Number(
    parcelOrId.lat ??
    parcelOrId.latlng?.lat ??
    parcelOrId.properties?.LATITUDE ??
    parcelOrId.properties?.latitude
  )
  const lng = Number(
    parcelOrId.lng ??
    parcelOrId.latlng?.lng ??
    parcelOrId.properties?.LONGITUDE ??
    parcelOrId.properties?.longitude
  )
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }
}

function coordsNear(aLat, aLng, bLat, bLng, eps = LEAD_COORD_EPS) {
  return Math.abs(aLat - bLat) <= eps && Math.abs(aLng - bLng) <= eps
}

export function findLeadById(leads, leadId) {
  if (leadId == null || leadId === '' || !Array.isArray(leads)) return null
  const key = String(leadId)
  return leads.find((lead) => lead?.id != null && String(lead.id) === key) || null
}

export function findLeadByParcelId(leads, parcelOrId) {
  if (!leads?.length || parcelOrId == null || parcelOrId === '') return null

  if (typeof parcelOrId === 'object' && parcelOrId.leadId) {
    const byLeadId = leads.find((l) => l.id === parcelOrId.leadId)
    if (byLeadId) return byLeadId
  }

  const parcelIds = parcelIdCandidateSet(parcelOrId)
  const { lat: parcelLat, lng: parcelLng } = extractParcelCoords(
    typeof parcelOrId === 'object' ? parcelOrId : null
  )

  return (
    leads.find((lead) => {
      const leadIds = collectLeadParcelIdCandidates(lead)
      if (parcelIds.size) {
        for (const id of parcelIds) {
          if (leadIds.has(id)) return true
        }
      }
      if (parcelLat != null && parcelLng != null) {
        const leadLat = Number(lead.lat)
        const leadLng = Number(lead.lng)
        if (Number.isFinite(leadLat) && Number.isFinite(leadLng)) {
          if (coordsNear(parcelLat, parcelLng, leadLat, leadLng)) return true
        }
      }
      return false
    }) || null
  )
}

export function isParcelALead(leads, parcelOrId) {
  return !!findLeadByParcelId(leads, parcelOrId)
}

export function displayLeadName(lead) {
  if (!lead) return 'Unknown'
  const parts = [lead.firstName, lead.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return formatLeadAddress(lead) || 'Unknown'
}

/** Strip zip, country, and extra segments — show street, city, state only. */
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

const STREET_SUFFIXES = new Set([
  'ST', 'STREET', 'AVE', 'AV', 'AVENUE', 'BLVD', 'BOULEVARD', 'DR', 'DRIVE',
  'RD', 'ROAD', 'LN', 'LANE', 'CT', 'COURT', 'PL', 'PLACE', 'WAY', 'CIR',
  'CIRCLE', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY', 'TER', 'TERRACE', 'TRL',
  'TRAIL', 'LOOP', 'EXPY', 'EXPRESSWAY', 'PLZ', 'SQUARE', 'SQ', 'RUN',
  'PATH', 'PASS', 'XING', 'CROSSING', 'BND', 'BEND', 'PT', 'POINT',
])

const DIRECTIONALS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'])

function formatStreetSuffix(word) {
  const upper = word.toUpperCase()
  if (!STREET_SUFFIXES.has(upper)) return null
  if (upper.length <= 2) return upper.charAt(0) + upper.slice(1).toLowerCase()
  return upper.charAt(0) + upper.slice(1).toLowerCase()
}

function formatAddressWord(word) {
  if (!word) return word
  if (/^\d+$/.test(word)) return word

  const ordinal = word.match(/^(\d+)(ST|ND|RD|TH)$/i)
  if (ordinal) return `${ordinal[1]}${ordinal[2].toLowerCase()}`

  const unit = word.match(/^(\d+)([A-Za-z])$/)
  if (unit) return `${unit[1]}${unit[2].toUpperCase()}`

  const upper = word.toUpperCase()
  if (DIRECTIONALS.has(upper)) return upper
  if (US_STATE_CODES.has(upper)) return upper

  const suffix = formatStreetSuffix(word)
  if (suffix) return suffix

  if (upper === 'PO' || upper === 'P.O.' || upper === 'P.O') return 'PO'
  if (upper === 'BOX') return 'Box'
  if (upper === 'APT' || upper === 'STE' || upper === 'UNIT') {
    return upper.charAt(0) + upper.slice(1).toLowerCase()
  }

  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function formatAddressSegment(segment) {
  const trimmed = String(segment || '').trim()
  if (!trimmed) return trimmed

  const stateOnly = trimmed.match(/^([A-Za-z]{2})$/)
  if (stateOnly && US_STATE_CODES.has(stateOnly[1].toUpperCase())) {
    return stateOnly[1].toUpperCase()
  }

  const cityState = trimmed.match(/^(.+?)\s+([A-Za-z]{2})$/)
  if (cityState && US_STATE_CODES.has(cityState[2].toUpperCase())) {
    return `${formatAddressSegment(cityState[1])} ${cityState[2].toUpperCase()}`
  }

  return trimmed.split(/\s+/).map(formatAddressWord).join(' ')
}

/** Title-case a normalized US address for display (street, city, state). */
export function formatAddressProperCase(address) {
  if (!address?.trim()) return address || ''
  return address
    .split(',')
    .map((part) => formatAddressSegment(part.trim()))
    .filter(Boolean)
    .join(', ')
}

export function formatLeadAddress(leadOrAddress) {
  const lead = typeof leadOrAddress === 'object' && leadOrAddress !== null ? leadOrAddress : null
  const addr = lead?.address ?? (typeof leadOrAddress === 'string' ? leadOrAddress : '')
  if (!addr?.trim()) return ''

  const p = lead?.properties
  if (p) {
    const city = p.scity || p.PROP_CITY || p.SITUS_CITY || p.CITY || ''
    const state = p.state2 || p.PROP_STATE || p.SITUS_STATE || p.STATE || ''
    const street = p.STREET || p.ADDR_LINE1 || p.saddstr || ''
    if (street.trim() && (city || state)) {
      return formatAddressProperCase([street.trim(), city, state].filter(Boolean).join(', '))
    }
  }

  let str = addr.trim().replace(/,\s*(United States|USA|U\.S\.A\.)\s*$/i, '').trim()
  const parts = str.split(',').map((part) => part.trim()).filter(Boolean)

  const stripZip = (segment) => segment.replace(/\s+\d{5}(?:-\d{4})?(?:\s.*)?$/, '').trim()

  if (parts.length >= 3) {
    return formatAddressProperCase([parts[0], parts[1], stripZip(parts[2])].filter(Boolean).join(', '))
  }

  if (parts.length === 2) {
    const street = parts[0]
    const tail = parts[1]
    const cityStateZip = tail.match(/^(.+?)\s+([A-Z]{2})\s+\d{5}/)
    if (cityStateZip) {
      return formatAddressProperCase([street, cityStateZip[1].trim(), cityStateZip[2]].join(', '))
    }
    return formatAddressProperCase([street, stripZip(tail)].filter(Boolean).join(', '))
  }

  const stateZipMatch = str.match(/^(.+?)\s+([A-Z]{2})\s+\d{5}/)
  if (stateZipMatch) {
    const before = stateZipMatch[1].trim()
    const words = before.split(/\s+/).filter(Boolean)
    if (words.length >= 3) {
      const city = words.slice(-2).join(' ')
      const street = words.slice(0, -2).join(' ')
      return formatAddressProperCase([street, city, stateZipMatch[2]].join(', '))
    }
    if (words.length === 2) {
      return formatAddressProperCase([words[0], words[1], stateZipMatch[2]].join(', '))
    }
  }

  return formatAddressProperCase(str)
}

/** Map lead record to parcel-shaped data for map navigation (no synthetic owner from contact name). */
export function leadToParcelData(lead) {
  if (!lead) return null
  return {
    id: lead.parcelId,
    parcelId: lead.parcelId,
    leadId: lead.id,
    address: lead.address || getFullAddress(lead),
    properties: lead.properties || {
      SITUS_ADDR: lead.address || '',
      LATITUDE: lead.lat ?? '',
      LONGITUDE: lead.lng ?? '',
      ...(lead.parcelId ? { PROP_ID: lead.parcelId } : {}),
    },
    lat: lead.lat,
    lng: lead.lng,
  }
}

export function buildLeadPrefillFromParcel(parcelData, skipTrace = null) {
  const rawOwner = parcelData?.properties?.OWNER_NAME || null
  const { firstName, lastName } = splitOwnerName(rawOwner)
  const contact = skipTrace ? skipTraceContactDetails(skipTrace) : normalizeLeadContactsForStorage({})
  return {
    firstName,
    lastName,
    address: getFullAddress(parcelData),
    parcelId: resolveParcelId(parcelData) || parcelData?.id || null,
    lat: parcelData?.lat ?? (parcelData?.properties?.LATITUDE ? parseFloat(parcelData.properties.LATITUDE) : null),
    lng: parcelData?.lng ?? (parcelData?.properties?.LONGITUDE ? parseFloat(parcelData.properties.LONGITUDE) : null),
    phone: contact.phone ? formatPhoneDisplay(contact.phone) : '',
    email: contact.email || '',
    phoneDetails: contact.phoneDetails.map((d) => ({
      ...d,
      value: formatPhoneDisplay(d.value),
    })),
    emailDetails: contact.emailDetails,
    notes: '',
    properties: parcelData?.properties || null,
  }
}

/** Minimal lead payload for silent create-from-parcel (photo mode, etc.). */
export function buildAutoLeadPayloadFromParcel(parcelData, skipTrace = null) {
  const prefill = buildLeadPrefillFromParcel(parcelData, skipTrace)
  const address = (prefill.address || parcelData?.address || '').trim()
  if (!address) throw new Error('Could not determine parcel address')
  let firstName = (prefill.firstName || '').trim()
  let lastName = (prefill.lastName || '').trim()
  if (!firstName && !lastName) lastName = 'Property'
  return withNormalizedLeadContact({
    firstName,
    lastName,
    address,
    ...skipTraceContactDetails(skipTrace),
    notes: '',
    parcelId: prefill.parcelId,
    lat: prefill.lat,
    lng: prefill.lng,
    properties: prefill.properties,
  })
}
