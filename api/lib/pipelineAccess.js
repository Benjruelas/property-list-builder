/**
 * Shared pipeline lookup + access for deal photo/file APIs.
 */

import { getAllTeams } from './teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  canEdit,
} from './resourceContext.js'
import { getAllPipelines } from './pipelineStoreFull.js'

export async function buildPipelineAccessContext(user) {
  const allTeams = await getAllTeams()
  return buildAccessContext(allTeams, user)
}

export async function getPipelineWithAccess(user, pipelineId) {
  const [all, ctx] = await Promise.all([getAllPipelines(), buildPipelineAccessContext(user)])
  const index = all.findIndex((p) => p.id === pipelineId)
  const pipeline = index >= 0 ? all[index] : null
  if (!pipeline) return { pipeline: null, access: null, all, ctx, index: -1 }
  const access = getResourceAccess(pipeline, user, ctx)
  if (!access) return { pipeline: null, access: null, all, ctx, index: -1 }
  return { pipeline, access, all, ctx, index }
}

export function canEditPipeline(access) {
  return canEdit(access) && access !== 'admin_view'
}

export function canMutateDealPhotos(user, pipeline, access, photo = null) {
  if (!user?.uid || !pipeline) return false
  if (pipeline.ownerId && pipeline.ownerId === user.uid) return true
  if (canEditPipeline(access)) return true
  if (photo?.capturedByUid && photo.capturedByUid === user.uid) return true
  return false
}

export async function userCanAccessDealInPipeline(user, pipelineId, dealId) {
  const { pipeline, access } = await getPipelineWithAccess(user, pipelineId)
  if (!pipeline || !access) return { allowed: false, canEdit: false, pipeline: null, deal: null }
  const deal = (pipeline.deals || []).find((d) => d.id === dealId) || null
  if (!deal) return { allowed: false, canEdit: false, pipeline, deal: null }
  return {
    allowed: true,
    canEdit: canEditPipeline(access),
    pipeline,
    deal,
    access,
  }
}

export async function userCanAccessDealFileKey(user, key) {
  if (!key?.startsWith('deal-files/')) return false
  const parts = key.split('/')
  const ownerUid = parts[1]
  const dealId = parts[2]
  if (ownerUid === user.uid) return true

  const [pipelines, ctx] = await Promise.all([getAllPipelines(), buildPipelineAccessContext(user)])
  for (const pipeline of pipelines) {
    if (!(pipeline.deals || []).some((d) => d.id === dealId)) continue
    const access = getResourceAccess(pipeline, user, ctx)
    if (access) return true
  }
  return false
}
