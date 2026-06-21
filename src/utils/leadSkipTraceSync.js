import {
  buildAutoLeadPayloadFromParcel,
  findLeadByParcelId,
  createLead,
  updateLead,
} from './leads'
import {
  getLeadPhoneDetails,
  getLeadEmailDetails,
  leadContactFieldsFromDetails,
  mergeLeadContactsWithSkipTrace,
  normalizePhoneDetail,
  normalizeEmailDetail,
  normalizePhoneKey,
  normalizeEmailKey,
  skipTraceContactDetails,
} from './leadContact'

function hasAnySkipTraceContact(skipTraceData) {
  const contact = skipTraceContactDetails(skipTraceData)
  return contact.phones.length > 0 || contact.emails.length > 0
}

export function mergeSkipTraceIntoLead(lead, skipTraceData) {
  const incoming = skipTraceContactDetails(skipTraceData)
  const phoneDetails = mergeLeadContactsWithSkipTrace(
    getLeadPhoneDetails(lead),
    incoming.phoneDetails,
    { normalizeKey: normalizePhoneKey, normalizeDetail: normalizePhoneDetail },
  )
  const emailDetails = mergeLeadContactsWithSkipTrace(
    getLeadEmailDetails(lead),
    incoming.emailDetails,
    { normalizeKey: normalizeEmailKey, normalizeDetail: normalizeEmailDetail },
  )
  const next = leadContactFieldsFromDetails(phoneDetails, emailDetails)
  const prevPhones = getLeadPhoneDetails(lead).map((d) => d.value).join('|')
  const prevEmails = getLeadEmailDetails(lead).map((d) => d.value).join('|')
  const changed = prevPhones !== next.phones.join('|') || prevEmails !== next.emails.join('|')
  return { changed, patch: next }
}

export function buildLeadPayloadFromSkipTrace(parcelData, skipTraceData) {
  const base = buildAutoLeadPayloadFromParcel(parcelData, skipTraceData)
  return {
    ...base,
    skipTracedAt: skipTraceData?.skipTracedAt || new Date().toISOString(),
  }
}

export async function applySkipTraceContactsToLead({
  parcelId,
  parcelData = null,
  skipTraceData,
  leads = [],
  getToken,
}) {
  if (!hasAnySkipTraceContact(skipTraceData)) {
    return { action: 'skipped', reason: 'no_contacts' }
  }

  const existing = findLeadByParcelId(leads, parcelId)
  if (existing?.id) {
    const { changed, patch } = mergeSkipTraceIntoLead(existing, skipTraceData)
    if (!changed) return { action: 'unchanged', lead: existing }
    const lead = await updateLead(getToken, existing.id, {
      ...patch,
      skipTracedAt: skipTraceData?.skipTracedAt || new Date().toISOString(),
    })
    return { action: 'updated', lead }
  }

  if (!parcelData) {
    return { action: 'skipped', reason: 'missing_parcel_data' }
  }

  const lead = await createLead(getToken, buildLeadPayloadFromSkipTrace(parcelData, skipTraceData))
  return { action: 'created', lead }
}

export async function applySkipTraceResultsToLeads({
  results = [],
  leads = [],
  getToken,
  resolveParcelData,
}) {
  const outcomes = []
  let nextLeads = [...leads]
  for (const result of results) {
    if (!result?.parcelId) continue
    const parcelData = resolveParcelData?.(result.parcelId) || null
    try {
      const outcome = await applySkipTraceContactsToLead({
        parcelId: result.parcelId,
        parcelData,
        skipTraceData: result,
        leads: nextLeads,
        getToken,
      })
      outcomes.push(outcome)
      if (outcome.lead) {
        nextLeads = nextLeads.filter((l) => l.id !== outcome.lead.id).concat(outcome.lead)
      }
    } catch (error) {
      outcomes.push({ action: 'error', parcelId: result.parcelId, error })
    }
  }
  return { outcomes, leads: nextLeads }
}

export { skipTraceContactDetails }
