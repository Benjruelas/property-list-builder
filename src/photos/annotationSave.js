import {
  presignAnnotationUpload,
  saveAnnotations,
  uploadBytesViaApi,
  PHOTO_DIRECT_R2_UPLOAD,
  assertPhotoStorage,
  invalidatePhotoBlobCache,
} from './photosClient'
import { apiBodyFromRef } from './entityRef'
import { photoLog } from './photoDebug'

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
  const previewUrl = annotatedBlob ? URL.createObjectURL(annotatedBlob) : null
  const thumbPreviewUrl = annotatedThumbnailBlob
    ? URL.createObjectURL(annotatedThumbnailBlob)
    : null

  const retryPayload = {
    annotations,
    file: annotatedBlob,
    thumbnail: annotatedThumbnailBlob,
  }

  const optimisticPhoto = {
    ...photo,
    annotations,
    _annotatedPreviewUrl: previewUrl,
    _annotatedThumbPreviewUrl: thumbPreviewUrl,
    _annotationSaving: true,
    _annotationSaveFailed: false,
    _annotationRetryPayload: retryPayload,
    updatedAt: new Date().toISOString(),
  }

  onOptimistic?.(optimisticPhoto)

  const startedAt = performance.now()

  try {
    assertPhotoStorage(
      entityType,
      existingPhotos,
      annotatedBlob.size + (annotatedThumbnailBlob?.size || 0)
        - ((Number(photo.annotatedSize) || 0) + (Number(photo.annotatedThumbnailSize) || 0)),
    )

    const presignStarted = performance.now()
    const presign = await presignAnnotationUpload(getToken, entityRef, photo.id)
    photoLog('client.annotation.presign', 'Presign OK', {
      photoId: photo.id,
      ms: Math.round(performance.now() - presignStarted),
    })

    const uploadStarted = performance.now()
    const uploadAnnotated = async () => {
      if (
        PHOTO_DIRECT_R2_UPLOAD
        && presign.annotatedUploadUrl
        && (!annotatedThumbnailBlob || presign.annotatedThumbnailUploadUrl)
      ) {
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
        if (origRes.ok && thumbRes.ok) return
      }
      await Promise.all([
        uploadBytesViaApi(getToken, entityRef, presign.annotatedKey, annotatedBlob),
        annotatedThumbnailBlob && presign.annotatedThumbnailKey
          ? uploadBytesViaApi(getToken, entityRef, presign.annotatedThumbnailKey, annotatedThumbnailBlob)
          : Promise.resolve(),
      ])
    }

    await uploadAnnotated()
    photoLog('client.annotation.upload', 'Upload OK', {
      photoId: photo.id,
      ms: Math.round(performance.now() - uploadStarted),
      directR2: PHOTO_DIRECT_R2_UPLOAD,
    })

    const patchStarted = performance.now()
    const result = await saveAnnotations(getToken, entityRef, {
      photoId: photo.id,
      annotations,
      annotatedKey: presign.annotatedKey,
      annotatedSize: annotatedBlob.size,
      annotatedThumbnailKey: annotatedThumbnailBlob ? presign.annotatedThumbnailKey : undefined,
      annotatedThumbnailSize: annotatedThumbnailBlob?.size || 0,
    })
    photoLog('client.annotation.patch', 'PATCH OK', {
      photoId: photo.id,
      ms: Math.round(performance.now() - patchStarted),
      totalMs: Math.round(performance.now() - startedAt),
    })

    invalidatePhotoBlobCache(photo)
    invalidatePhotoBlobCache(result.photo)
    const entity = result.lead || result.deal
    return { entity, photo: result.photo }
  } catch (e) {
    const failedPhoto = {
      ...optimisticPhoto,
      _annotationSaving: false,
      _annotationSaveFailed: true,
      _annotationSaveError: e.message || 'Save failed',
      _annotationRetryPayload: retryPayload,
    }
    onOptimistic?.(failedPhoto)
    photoLog('client.annotation.error', 'Save failed', {
      photoId: photo.id,
      ms: Math.round(performance.now() - startedAt),
      error: e.message,
    })
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
