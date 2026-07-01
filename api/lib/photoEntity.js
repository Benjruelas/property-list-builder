/**
 * Shared lead/deal photo entity resolution for unified /api/photos.
 */

import {
  getLeadWithAccess,
  mutateSingleLead,
  canMutateLeadPhotos,
  withRepairedLeadOwnership,
} from './leadAccess.js'
import {
  getPipelineWithAccess,
  canMutateDealPhotos,
  buildPipelineAccessContext,
  getResourceAccess,
} from './pipelineAccess.js'
import { getAllPipelines, mutatePipelines } from './pipelineStoreFull.js'
import {
  ENTITY_STORAGE_LIMITS,
  sumLeadPhotoBytes,
} from './uploadLimits.js'

export function sanitizePhotoId(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80)
}

export function photoKeyPrefix(entityType) {
  return entityType === 'deal' ? 'deal-photos' : 'lead-photos'
}

export function buildPhotoKey(entityType, ownerUid, entityId, photoId, variant) {
  return `${photoKeyPrefix(entityType)}/${ownerUid}/${entityId}/${photoId}/${variant}.jpg`
}

export function parseEntityType(body = {}, query = {}) {
  const t = String(body.entityType || query.entityType || 'lead').toLowerCase()
  return t === 'deal' ? 'deal' : 'lead'
}

export function storageLimit(entityType) {
  return entityType === 'deal' ? ENTITY_STORAGE_LIMITS.dealPhotos : ENTITY_STORAGE_LIMITS.lead
}

export function sumPhotoBytes(photos) {
  return sumLeadPhotoBytes(photos)
}

export function buildPhotoRecord(body, user, photoId, key, thumbnailKey, sizes) {
  const now = new Date().toISOString()
  return {
    id: photoId,
    key,
    thumbnailKey: thumbnailKey || key,
    annotatedKey: null,
    contentType: body.contentType || 'image/jpeg',
    size: sizes.original,
    thumbnailSize: sizes.thumbnail,
    width: body.width ?? null,
    height: body.height ?? null,
    blurHash: body.blurHash ? String(body.blurHash).slice(0, 120) : null,
    capturedAt: body.capturedAt || now,
    capturedByUid: user.uid,
    capturedByName: String(body.capturedByName || '').slice(0, 120) || null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    addressLabel: String(body.addressLabel || '').slice(0, 300) || null,
    parcelId: body.parcelId ? sanitizePhotoId(body.parcelId) : null,
    annotations: { version: 1, objects: [] },
    createdAt: now,
    updatedAt: now,
  }
}

async function resolveLeadContext(user, leadId) {
  const { lead, access } = await getLeadWithAccess(user, leadId)
  if (!lead) return { error: { status: 404, message: 'Lead not found' } }
  if (!access) return { error: { status: 403, message: 'Forbidden' } }
  return {
    entityType: 'lead',
    entity: lead,
    ownerUid: lead.ownerId || user.uid,
    photos: Array.isArray(lead.photos) ? lead.photos : [],
    canMutate: (photo) => canMutateLeadPhotos(user, lead, access, photo),
    canAdd: () => canMutateLeadPhotos(user, lead, access),
  }
}

async function resolveDealContext(user, pipelineId, dealId) {
  const { pipeline, access, all, index } = await getPipelineWithAccess(user, pipelineId)
  if (!pipeline) return { error: { status: 404, message: 'Pipeline not found' } }
  if (!access) return { error: { status: 403, message: 'Forbidden' } }
  const deals = Array.isArray(pipeline.deals) ? pipeline.deals : []
  const dealIndex = deals.findIndex((d) => d.id === dealId)
  if (dealIndex === -1) return { error: { status: 404, message: 'Deal not found' } }
  const deal = deals[dealIndex]
  return {
    entityType: 'deal',
    entity: deal,
    pipeline,
    pipelineIndex: index,
    allPipelines: all,
    dealIndex,
    ownerUid: pipeline.ownerId || user.uid,
    photos: Array.isArray(deal.photos) ? deal.photos : [],
    canMutate: (photo) => canMutateDealPhotos(user, pipeline, access, photo),
    canAdd: () => canMutateDealPhotos(user, pipeline, access),
  }
}

export async function resolvePhotoContext(user, body = {}) {
  const entityType = parseEntityType(body)
  if (entityType === 'deal') {
    const pipelineId = sanitizePhotoId(body.pipelineId)
    const dealId = sanitizePhotoId(body.dealId)
    if (!pipelineId || !dealId) {
      return { error: { status: 400, message: 'pipelineId and dealId are required' } }
    }
    return resolveDealContext(user, pipelineId, dealId)
  }
  const leadId = sanitizePhotoId(body.leadId)
  if (!leadId) return { error: { status: 400, message: 'leadId is required' } }
  return resolveLeadContext(user, leadId)
}

export async function appendPhotoRecord(user, ctx, photoRecord) {
  if (ctx.entityType === 'lead') {
    const leadId = ctx.entity.id
    const updated = await mutateSingleLead(leadId, (existing) =>
      withRepairedLeadOwnership({
        ...existing,
        ownerId: existing.ownerId || user.uid,
        ownerEmail: existing.ownerEmail || user.email || null,
        photos: [...(existing.photos || []), photoRecord],
        updatedAt: new Date().toISOString(),
      }, user))
    if (!updated) return { error: { status: 404, message: 'Lead not found' } }
    return { entity: updated, photo: photoRecord }
  }

  const deal = {
    ...ctx.entity,
    photos: [...(ctx.photos || []), photoRecord],
    updatedAt: Date.now(),
  }
  const prevPipeline = ctx.allPipelines[ctx.pipelineIndex]
  const deals = [...(prevPipeline.deals || [])]
  deals[ctx.dealIndex] = deal
  const nextPipeline = { ...prevPipeline, deals, updatedAt: new Date().toISOString() }
  await mutatePipelines((current) => {
    const at = current.findIndex((p) => p.id === prevPipeline.id)
    if (at === -1) return undefined
    const next = [...current]
    next[at] = nextPipeline
    return next
  }, { changedResources: [{ resource: nextPipeline, prevResource: prevPipeline }] })
  return { entity: deal, photo: photoRecord, pipeline: nextPipeline }
}

export async function updatePhotoRecord(user, ctx, photoId, updater) {
  if (ctx.entityType === 'lead') {
    const leadId = ctx.entity.id
    let updatedPhoto = null
    const updated = await mutateSingleLead(leadId, (prev) => {
      const list = [...(prev.photos || [])]
      const at = list.findIndex((p) => p.id === photoId)
      if (at === -1) return null
      updatedPhoto = updater(list[at])
      list[at] = updatedPhoto
      return { ...prev, photos: list, updatedAt: new Date().toISOString() }
    })
    if (!updated) return { error: { status: 404, message: 'Lead not found' } }
    return { entity: updated, photo: updatedPhoto }
  }

  const photos = [...ctx.photos]
  const at = photos.findIndex((p) => p.id === photoId)
  if (at === -1) return { error: { status: 404, message: 'Photo not found' } }
  const updatedPhoto = updater(photos[at])
  photos[at] = updatedPhoto
  const deal = { ...ctx.entity, photos, updatedAt: Date.now() }
  const prevPipeline = ctx.allPipelines[ctx.pipelineIndex]
  const deals = [...(prevPipeline.deals || [])]
  deals[ctx.dealIndex] = deal
  const nextPipeline = { ...prevPipeline, deals, updatedAt: new Date().toISOString() }
  await mutatePipelines((current) => {
    const idx = current.findIndex((p) => p.id === prevPipeline.id)
    if (idx === -1) return undefined
    const next = [...current]
    next[idx] = nextPipeline
    return next
  }, { changedResources: [{ resource: nextPipeline, prevResource: prevPipeline }] })
  return { entity: deal, photo: updatedPhoto, pipeline: nextPipeline }
}

export async function deletePhotoRecord(user, ctx, photoId) {
  if (ctx.entityType === 'lead') {
    const leadId = ctx.entity.id
    const updated = await mutateSingleLead(leadId, (existing) =>
      withRepairedLeadOwnership({
        ...existing,
        photos: (existing.photos || []).filter((p) => p.id !== photoId),
        updatedAt: new Date().toISOString(),
      }, user))
    if (!updated) return { error: { status: 404, message: 'Lead not found' } }
    return { entity: updated }
  }

  const deal = {
    ...ctx.entity,
    photos: (ctx.photos || []).filter((p) => p.id !== photoId),
    updatedAt: Date.now(),
  }
  const prevPipeline = ctx.allPipelines[ctx.pipelineIndex]
  const deals = [...(prevPipeline.deals || [])]
  deals[ctx.dealIndex] = deal
  const nextPipeline = { ...prevPipeline, deals, updatedAt: new Date().toISOString() }
  await mutatePipelines((current) => {
    const idx = current.findIndex((p) => p.id === prevPipeline.id)
    if (idx === -1) return undefined
    const next = [...current]
    next[idx] = nextPipeline
    return next
  }, { changedResources: [{ resource: nextPipeline, prevResource: prevPipeline }] })
  return { entity: deal, pipeline: nextPipeline }
}

export async function canAccessPhotoKey(user, key) {
  if (key.startsWith('lead-photos/')) {
    const parts = key.split('/')
    const ownerUid = parts[1]
    const leadId = parts[2]
    if (ownerUid === user.uid) return true
    const { lead, access } = await getLeadWithAccess(user, leadId)
    return !!lead && !!access
  }
  if (key.startsWith('deal-photos/')) {
    const parts = key.split('/')
    const ownerUid = parts[1]
    const dealId = parts[2]
    if (ownerUid === user.uid) return true
    const [pipelines, ctx] = await Promise.all([getAllPipelines(), buildPipelineAccessContext(user)])
    for (const pipeline of pipelines) {
      if (!(pipeline.deals || []).some((d) => d.id === dealId)) continue
      if (getResourceAccess(pipeline, user, ctx)) return true
    }
  }
  return false
}
