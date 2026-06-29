import {
  presignAnnotationUpload,
  saveAnnotations,
  assertPhotoStorage,
} from './photosClient'
import { apiBodyFromRef } from './entityRef'

export function updatePhotoInList(photos, photoId, next) {
  const list = Array.isArray(photos) ? photos : []
  const at = list.findIndex((p) => p.id === photoId)
  if (at === -1) return list
  const copy = [...list]
  copy[at] = next
  return copy
}

export async function savePhotoAnnotations(getToken, entityRef, {
  photo,
  annotations,
  annotatedBlob,
  annotatedThumbnailBlob,
  existingPhotos = [],
  onOptimistic,
}) {
  const entityType = entityRef.entityType || (entityRef.dealId ? 'deal' : 'lead')
  const previewUrl = annotatedThumbnailBlob
    ? URL.createObjectURL(annotatedThumbnailBlob)
    : null

  const optimisticPhoto = {
    ...photo,
    annotations,
    _annotatedPreviewUrl: previewUrl,
    _annotationSaving: true,
    _annotationSaveFailed: false,
    updatedAt: new Date().toISOString(),
  }

  onOptimistic?.(optimisticPhoto)

  try {
    assertPhotoStorage(
      entityType,
      existingPhotos,
      annotatedBlob.size + (annotatedThumbnailBlob?.size || 0)
        - ((Number(photo.annotatedSize) || 0) + (Number(photo.annotatedThumbnailSize) || 0)),
    )

    const presign = await presignAnnotationUpload(getToken, entityRef, photo.id)
    const [origRes, thumbRes] = await Promise.all([
      fetch(presign.annotatedUploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: annotatedBlob,
      }),
      annotatedThumbnailBlob
        ? fetch(presign.annotatedThumbnailUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: annotatedThumbnailBlob,
        })
        : Promise.resolve({ ok: true }),
    ])

    if (!origRes.ok || !thumbRes.ok) {
      throw new Error('Annotation upload failed')
    }

    const result = await saveAnnotations(getToken, entityRef, {
      photoId: photo.id,
      annotations,
      annotatedKey: presign.annotatedKey,
      annotatedSize: annotatedBlob.size,
      annotatedThumbnailKey: annotatedThumbnailBlob ? presign.annotatedThumbnailKey : undefined,
      annotatedThumbnailSize: annotatedThumbnailBlob?.size || 0,
    })

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const entity = result.lead || result.deal
    return { entity, photo: result.photo }
  } catch (e) {
    const failedPhoto = {
      ...optimisticPhoto,
      _annotationSaving: false,
      _annotationSaveFailed: true,
      _annotationSaveError: e.message || 'Save failed',
    }
    onOptimistic?.(failedPhoto)
    throw e
  }
}

export function entityRefFromLead(lead) {
  return { entityType: 'lead', leadId: lead.id, entityId: lead.id }
}

export function entityRefFromDeal(deal, pipelineId) {
  return { entityType: 'deal', pipelineId, dealId: deal.id, entityId: deal.id }
}

export { apiBodyFromRef }
