/**
 * User-scoped leads API client.
 */

import { splitOwnerName } from './ownerName'
import { getFullAddress } from './dealPipeline'
import { collectParcelIdCandidates, resolveParcelId } from './parcelPropertyMap'

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

const LOCAL_LEADS_KEY = 'user_leads_local'
const MAX_LEAD_ACTIVITY = 200

export const LEAD_STATUSES = [
  { id: 'new', label: 'New', color: 'bg-slate-500/25 text-slate-200 border-slate-400/40' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 text-blue-200 border-blue-400/40' },
  { id: 'qualified', label: 'Qualified', color: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  { id: 'converted', label: 'Converted', color: 'bg-green-500/20 text-green-200 border-green-400/40' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500/20 text-red-200 border-red-400/40' },
]

const LEAD_STATUS_IDS = new Set(LEAD_STATUSES.map((s) => s.id))
const OUTREACH_ACTIVITY_TYPES = new Set(['call', 'text', 'email'])

export function getLeadStatusMeta(statusId) {
  return LEAD_STATUSES.find((s) => s.id === statusId) || LEAD_STATUSES[0]
}

/** Effective status — derives converted when lead has deals unless explicitly lost. */
export function getLeadStatus(lead, dealCount = 0) {
  if (!lead) return 'new'
  if (lead.status === 'lost') return 'lost'
  if (dealCount > 0) return 'converted'
  const raw = lead.status || 'new'
  return LEAD_STATUS_IDS.has(raw) ? raw : 'new'
}

export function lastContactedAt(lead) {
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

export async function fetchLeads(getToken) {
  const token = await getToken()
  if (!token) return loadLocalLeads()
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch leads')
  const data = await res.json()
  const leads = data.leads || []
  saveLocalLeads(leads)
  return leads
}

export async function createLead(getToken, leadData) {
  const token = await getToken()
  if (!token) {
    const leads = loadLocalLeads()
    if (leadData.parcelId && leads.some((l) => l.parcelId === leadData.parcelId)) {
      throw new Error('A lead already exists for this parcel')
    }
    const now = new Date().toISOString()
    const lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      status: 'new',
      statusUpdatedAt: now,
      activity: [],
      ...leadData,
      createdAt: now,
      updatedAt: now,
    }
    saveLocalLeads([...leads, lead])
    return lead
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(leadData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create lead')
  }
  const data = await res.json()
  return data.lead
}

export async function updateLead(getToken, leadId, updates) {
  const token = await getToken()
  if (!token) {
    const leads = loadLocalLeads()
    const idx = leads.findIndex((l) => l.id === leadId)
    if (idx === -1) throw new Error('Lead not found')
    const lead = { ...leads[idx], ...updates, updatedAt: new Date().toISOString() }
    leads[idx] = lead
    saveLocalLeads(leads)
    return lead
  }
  const res = await fetch(`${getApiBase()}/leads`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId, ...updates })
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
      return [street.trim(), city, state].filter(Boolean).join(', ')
    }
  }

  let str = addr.trim().replace(/,\s*(United States|USA|U\.S\.A\.)\s*$/i, '').trim()
  const parts = str.split(',').map((part) => part.trim()).filter(Boolean)

  const stripZip = (segment) => segment.replace(/\s+\d{5}(?:-\d{4})?(?:\s.*)?$/, '').trim()

  if (parts.length >= 3) {
    return [parts[0], parts[1], stripZip(parts[2])].filter(Boolean).join(', ')
  }

  if (parts.length === 2) {
    const street = parts[0]
    const tail = parts[1]
    const cityStateZip = tail.match(/^(.+?)\s+([A-Z]{2})\s+\d{5}/)
    if (cityStateZip) {
      return [street, cityStateZip[1].trim(), cityStateZip[2]].join(', ')
    }
    return [street, stripZip(tail)].filter(Boolean).join(', ')
  }

  const stateZipMatch = str.match(/^(.+?)\s+([A-Z]{2})\s+\d{5}/)
  if (stateZipMatch) {
    const before = stateZipMatch[1].trim()
    const words = before.split(/\s+/).filter(Boolean)
    if (words.length >= 3) {
      const city = words.slice(-2).join(' ')
      const street = words.slice(0, -2).join(' ')
      return [street, city, stateZipMatch[2]].join(', ')
    }
    if (words.length === 2) {
      return [words[0], words[1], stateZipMatch[2]].join(', ')
    }
  }

  return str
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
  return {
    firstName,
    lastName,
    address: getFullAddress(parcelData),
    parcelId: resolveParcelId(parcelData) || parcelData?.id || null,
    lat: parcelData?.lat ?? (parcelData?.properties?.LATITUDE ? parseFloat(parcelData.properties.LATITUDE) : null),
    lng: parcelData?.lng ?? (parcelData?.properties?.LONGITUDE ? parseFloat(parcelData.properties.LONGITUDE) : null),
    phone: skipTrace?.phone || skipTrace?.phoneNumbers?.[0] || '',
    email: skipTrace?.email || skipTrace?.emails?.[0] || '',
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
  return {
    firstName,
    lastName,
    address,
    phone: (prefill.phone || '').trim() || null,
    email: (prefill.email || '').trim() || null,
    notes: '',
    parcelId: prefill.parcelId,
    lat: prefill.lat,
    lng: prefill.lng,
    properties: prefill.properties,
  }
}
