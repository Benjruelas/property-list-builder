/**
 * CRM-first matching for the map AddressSearch dropdown.
 * Matches leads by name/phone/email/notes/addresses, then nests linked entities.
 */

import { displayLeadName, formatLeadAddress } from './leads'
import { getLeadPhones, getLeadEmails } from './leadContact'
import { getLeadAddressDetails } from './leadAddresses'
import { formatPhoneDisplay, parsePhoneDigits, phoneMatchesQuery } from './phoneFormat'
import { resolveLeadDeals, taskMatchesLead } from './dealTaskMatching'

function dealLabel(deal) {
  return (deal?.title || deal?.leadName || deal?.leadAddress || deal?.id || 'Deal').trim()
}

export const MAP_ENTITY_SEARCH_LEAD_LIMIT = 5

/** Street-number pattern: starts with digits, then whitespace, then a non-empty street token. */
export function isStreetNumberQuery(query) {
  const q = String(query || '').trim()
  return /^\d+\s+\S+/.test(q)
}

/** lat,lng coordinate shortcut (same idea as useMapboxGeocode). */
export function isCoordinateQuery(query) {
  const q = String(query || '').trim()
  const m = q.match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/)
  if (!m) return false
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** Queries that should consult Mapbox / show address suggestions. */
export function isAddressLikeQuery(query) {
  return isStreetNumberQuery(query) || isCoordinateQuery(query)
}

function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function fieldMatchesTokens(haystack, tokens) {
  if (!haystack) return false
  const h = String(haystack).toLowerCase()
  return tokens.every((tok) => h.includes(tok))
}

/**
 * Find the first field on a lead that matches the query tokens.
 * Priority: name → phones → emails → addresses → notes.
 * @returns {{ label: string, value: string } | null}
 */
export function findLeadMatchField(lead, query) {
  const tokens = tokenize(query)
  if (!tokens.length || !lead) return null

  const name = displayLeadName(lead)
  if (fieldMatchesTokens(name, tokens)) {
    return { label: 'Name', value: name }
  }

  // Only treat as a phone query when it's digit-heavy (avoid "123 Main" matching phones).
  const queryDigits = parsePhoneDigits(query)
  const queryIsPhoneLike =
    !!queryDigits &&
    queryDigits.length >= 3 &&
    !/[a-zA-Z]{2,}/.test(String(query || ''))

  if (queryIsPhoneLike) {
    for (const phone of getLeadPhones(lead)) {
      const display = formatPhoneDisplay(phone) || phone
      if (phoneMatchesQuery(phone, query) || phoneMatchesQuery(phone, queryDigits)) {
        return { label: 'Phone', value: display }
      }
    }
  }

  for (const email of getLeadEmails(lead)) {
    if (fieldMatchesTokens(email, tokens)) {
      return { label: 'Email', value: email }
    }
  }

  const addresses = getLeadAddressDetails(lead)
  for (const detail of addresses) {
    const value = detail?.value || ''
    if (fieldMatchesTokens(value, tokens)) {
      return { label: 'Address', value }
    }
  }
  const formatted = formatLeadAddress(lead)
  if (formatted && fieldMatchesTokens(formatted, tokens)) {
    return { label: 'Address', value: formatted }
  }

  const notes = (lead.notes || '').trim()
  if (notes && fieldMatchesTokens(notes, tokens)) {
    // Show a short snippet centered on the first matching token
    const lower = notes.toLowerCase()
    const firstTok = tokens[0]
    const idx = lower.indexOf(firstTok)
    const start = Math.max(0, idx - 20)
    const end = Math.min(notes.length, (idx >= 0 ? idx + firstTok.length : 40) + 40)
    let snippet = notes.slice(start, end).trim()
    if (start > 0) snippet = `…${snippet}`
    if (end < notes.length) snippet = `${snippet}…`
    return { label: 'Notes', value: snippet }
  }

  return null
}

/**
 * Match leads accessible to the user and attach linked deals/tasks/quotes/reports.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {object[]} opts.leads
 * @param {object[]} [opts.pipelines]
 * @param {object[]} [opts.tasks]
 * @param {object[]} [opts.quotes]
 * @param {object[]} [opts.reports]
 * @param {number} [opts.limit]
 */
export function searchMapEntities({
  query,
  leads = [],
  pipelines = [],
  tasks = [],
  quotes = [],
  reports = [],
  limit = MAP_ENTITY_SEARCH_LEAD_LIMIT,
} = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) return []

  const sorted = [...(leads || [])].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  )

  const matches = []
  for (const lead of sorted) {
    const match = findLeadMatchField(lead, q)
    if (!match) continue

    const linkedDeals = resolveLeadDeals(lead, pipelines)
    const linkedTasks = (tasks || []).filter((t) => taskMatchesLead(t, lead, pipelines))
    const linkedQuotes = (quotes || []).filter((qt) => qt?.leadId === lead.id)
    const linkedReports = (reports || []).filter((r) => r?.leadId === lead.id)

    const linked = []
    for (const deal of linkedDeals) {
      linked.push({
        type: 'deal',
        id: deal.id,
        label: dealLabel(deal),
        entity: deal,
      })
    }
    for (const task of linkedTasks) {
      linked.push({
        type: 'task',
        id: task.id,
        label: (task.title || 'Task').toString().trim() || 'Task',
        entity: task,
      })
    }
    for (const quote of linkedQuotes) {
      linked.push({
        type: 'quote',
        id: quote.id,
        label: (quote.title || 'Quote').toString().trim() || 'Quote',
        entity: quote,
      })
    }
    for (const report of linkedReports) {
      linked.push({
        type: 'report',
        id: report.id,
        label: (report.title || 'Report').toString().trim() || 'Report',
        entity: report,
      })
    }

    matches.push({
      type: 'lead',
      id: lead.id,
      lead,
      label: displayLeadName(lead),
      matchedFieldLabel: match.label,
      matchedFieldValue: match.value,
      linked,
    })

    if (matches.length >= limit) break
  }

  return matches
}

/**
 * Build the flat dropdown rows for AddressSearch.
 * Order: optional address suggestion(s) → each lead → that lead's linked items.
 *
 * @param {object} opts
 * @param {object[]} opts.addressResults - Mapbox results (already sliced by caller)
 * @param {object[]} opts.leadMatches - from searchMapEntities
 */
export function buildMapSearchRows({ addressResults = [], leadMatches = [] } = {}) {
  const rows = []

  for (const addr of addressResults || []) {
    rows.push({
      kind: 'address',
      key: `address:${addr.id || addr.place_name}`,
      result: addr,
      label: addr.place_name || '',
      secondary: null,
    })
  }

  for (const match of leadMatches || []) {
    rows.push({
      kind: 'lead',
      key: `lead:${match.id}`,
      match,
      label: match.label,
      secondary: match.matchedFieldValue
        ? `${match.matchedFieldLabel}: ${match.matchedFieldValue}`
        : null,
      nested: false,
    })
    for (const item of match.linked || []) {
      rows.push({
        kind: item.type,
        key: `${item.type}:${item.id}`,
        match,
        entity: item.entity,
        label: item.label,
        secondary: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        nested: true,
      })
    }
  }

  return rows
}
