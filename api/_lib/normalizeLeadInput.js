import { kv, kvAvailable } from './kvBootstrap.js'
import { applyResourceVisibilityPatch, assertExternalSharingAllowed } from './resourceContext.js'
import { isValidEmail } from './emailSafety.js'
import { mergeEntityTags } from './tagHelpers.js'
import {
  resolveAllowedLeadStatusIds,
  normalizeLeadStatusValue,
  normalizeLeadStatuses,
  DEFAULT_LEAD_STATUSES,
} from './leadStatuses.js'
import { normalizeLeadContactsForStorage } from './leadContact.js'
import { normalizeLeadAddressesForStorage } from './leadAddresses.js'
import { mergeCustomFieldValues, normalizeCustomFieldDefs } from './customFields.js'
import { normalizeAutoTaskFiredStatusIds } from './statusAutoTasks.js'

function userDataKey(uid) {
  return `user_data_${uid}`
}

export async function loadUserAppSettings(uid) {
  if (!kvAvailable || !kv || !uid) return null
  try {
    const data = await kv.get(userDataKey(uid))
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return parsed?.appSettings || null
  } catch {
    return null
  }
}

export function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Lead').trim()
}

export function resolveLeadStatusRegistry(ctx, userAppSettings) {
  if (ctx?.team?.leadStatuses?.length) return normalizeLeadStatuses(ctx.team.leadStatuses)
  if (!ctx?.team && userAppSettings?.leadStatuses?.length) {
    return normalizeLeadStatuses(userAppSettings.leadStatuses)
  }
  return normalizeLeadStatuses(DEFAULT_LEAD_STATUSES)
}

export function normalizeSharedWithEmails(input) {
  const arr = Array.isArray(input) ? input : []
  return [...new Set(
    arr
      .map((e) => String(e || '').trim().toLowerCase())
      .filter((e) => isValidEmail(e)),
  )]
}

export function resolveLeadCustomFieldDefs(ctx, userAppSettings) {
  if (ctx?.team) {
    return normalizeCustomFieldDefs(ctx.team.leadCustomFields || [])
  }
  return normalizeCustomFieldDefs(userAppSettings?.leadCustomFields || [])
}

export function normalizeLeadInput(body, user, existing = null, ctx = null, tagRegistry = null, allowedStatusIds = null, fieldDefs = []) {
  const now = new Date().toISOString()
  const firstName = String(body.firstName ?? existing?.firstName ?? '').trim()
  const lastName = String(body.lastName ?? existing?.lastName ?? '').trim()
  if (!firstName && !lastName) throw new Error('First or last name is required')

  const contact = normalizeLeadContactsForStorage(body, existing)
  const addressFields = normalizeLeadAddressesForStorage(body, existing)

  const base = {
    id: existing?.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    firstName,
    lastName,
    address: addressFields.address,
    parcelId: addressFields.parcelId,
    lat: addressFields.lat,
    lng: addressFields.lng,
    addressDetails: addressFields.addressDetails,
    phone: contact.phone,
    email: contact.email,
    phones: contact.phones,
    emails: contact.emails,
    phoneDetails: contact.phoneDetails,
    emailDetails: contact.emailDetails,
    notes: body.notes !== undefined ? String(body.notes || '') : (existing?.notes ?? ''),
    properties: addressFields.properties,
    ownerId: existing?.ownerId || user.uid,
    ownerEmail: existing?.ownerEmail || user.email,
    sharedWith: existing?.sharedWith || [],
    teamShares: existing?.teamShares || [],
    teamId: existing?.teamId ?? ctx?.team?.id ?? null,
    visibility: existing?.visibility || 'private',
    sharedMemberUids: existing?.sharedMemberUids || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  const tags = mergeEntityTags(body, existing, tagRegistry, 'leads')
  base.tagIds = tags.tagIds
  base.tagMeta = tags.tagMeta

  const allowedIds = allowedStatusIds || resolveAllowedLeadStatusIds(ctx, null)
  const nextStatus = normalizeLeadStatusValue(body.status, existing, allowedIds)
  base.status = nextStatus
  if (body.status !== undefined && (!existing || nextStatus !== existing.status)) {
    base.statusUpdatedAt = now
  } else {
    base.statusUpdatedAt = existing?.statusUpdatedAt || (existing?.createdAt || now)
  }
  base.activity = Array.isArray(existing?.activity) ? existing.activity : []
  base.photos = body.photos !== undefined
    ? (Array.isArray(body.photos) ? body.photos : existing?.photos || [])
    : (existing?.photos || [])
  base.files = body.files !== undefined
    ? (Array.isArray(body.files) ? body.files : existing?.files || [])
    : (existing?.files || [])

  base.customFields = mergeCustomFieldValues(
    body.customFields,
    existing?.customFields,
    fieldDefs,
  )
  base.autoTaskFiredStatusIds = normalizeAutoTaskFiredStatusIds(
    existing?.autoTaskFiredStatusIds || [],
  )

  let next = base
  if (body.visibility !== undefined || body.sharedMemberUids !== undefined || body.teamShares !== undefined) {
    next = applyResourceVisibilityPatch(base, body, ctx)
  } else if (body.sharedWith !== undefined) {
    assertExternalSharingAllowed(ctx?.team, body)
  }
  if (body.sharedWith !== undefined) {
    next = { ...next, sharedWith: normalizeSharedWithEmails(body.sharedWith) }
  }
  return next
}
