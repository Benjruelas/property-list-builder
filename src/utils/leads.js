/**
 * User-scoped leads API client.
 */

import { splitOwnerName } from './ownerName'
import { getFullAddress } from './dealPipeline'

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

const LOCAL_LEADS_KEY = 'user_leads_local'

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
  return data.leads || []
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

export function isParcelALead(leads, parcelId) {
  if (!parcelId) return false
  return (leads || []).some((l) => l.parcelId === parcelId)
}

export function findLeadByParcelId(leads, parcelId) {
  if (!parcelId) return null
  return (leads || []).find((l) => l.parcelId === parcelId) || null
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

export function buildLeadPrefillFromParcel(parcelData, skipTrace = null) {
  const rawOwner = parcelData?.properties?.OWNER_NAME || null
  const { firstName, lastName } = splitOwnerName(rawOwner)
  return {
    firstName,
    lastName,
    address: getFullAddress(parcelData),
    parcelId: parcelData?.id || null,
    lat: parcelData?.lat ?? (parcelData?.properties?.LATITUDE ? parseFloat(parcelData.properties.LATITUDE) : null),
    lng: parcelData?.lng ?? (parcelData?.properties?.LONGITUDE ? parseFloat(parcelData.properties.LONGITUDE) : null),
    phone: skipTrace?.phone || skipTrace?.phoneNumbers?.[0] || null,
    email: skipTrace?.email || skipTrace?.emails?.[0] || null,
    notes: '',
    properties: parcelData?.properties || null,
  }
}
