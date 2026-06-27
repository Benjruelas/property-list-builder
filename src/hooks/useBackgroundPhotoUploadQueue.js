import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPendingPhoto,
  estimatePhotoBytes,
  isPendingPhoto,
  persistedPhotos,
  replacePhotoInList,
  removePhotoFromList,
  insertPhotoInList,
  revokeLocalPreview,
  updatePhotoInList,
  UPLOAD_STATUS,
} from '@/utils/optimisticPhotoUpload'
import { showToast } from '@/components/ui/toast'

const MAX_CONCURRENT = 2

/**
 * Background photo upload queue with optimistic gallery updates.
 *
 * @param {object} options
 * @param {() => Promise<string|null>} options.getToken
 * @param {(source: File|string, existingPhotos: object[], entity: object) => Promise<{ entity: object, photo: object }>} options.uploadOne
 * @param {(entity: object) => void} options.onEntityUpdated
 * @param {(entity: object) => Promise<void>} [options.logActivity] - called once per successful upload
 */
export function useBackgroundPhotoUploadQueue({
  getToken,
  uploadOne,
  onEntityUpdated,
  logActivity,
}) {
  const entityRef = useRef(null)
  const cancelledRef = useRef(new Set())
  const jobsRef = useRef(new Map())
  const queueRef = useRef([])
  const activeCountRef = useRef(0)
  const [uploadingCount, setUploadingCount] = useState(0)

  const syncUploadingCount = useCallback(() => {
    setUploadingCount(activeCountRef.current + queueRef.current.length)
  }, [])

  const applyEntityPhotos = useCallback((entity, photos) => {
    if (!entity) return
    const next = {
      ...entity,
      photos,
      updatedAt: new Date().toISOString(),
    }
    entityRef.current = next
    onEntityUpdated?.(next)
  }, [onEntityUpdated])

  const runJob = useCallback(async (job) => {
    const { pendingId, source, entityAtEnqueue } = job
    if (cancelledRef.current.has(pendingId)) return

    try {
      const token = await getToken?.()
      if (!token) throw new Error('Sign in to upload photos')

      const currentEntity = entityRef.current || entityAtEnqueue
      const existingPhotos = persistedPhotos(currentEntity?.photos)
      const result = await uploadOne(source, existingPhotos, currentEntity)
      if (cancelledRef.current.has(pendingId)) return

      const latest = entityRef.current || entityAtEnqueue
      const pending = (latest?.photos || []).find((p) => p.id === pendingId)
      if (pending) revokeLocalPreview(pending)

      const mergedPhotos = replacePhotoInList(latest?.photos || [], pendingId, result.photo)
      applyEntityPhotos(latest, mergedPhotos)

      if (logActivity) {
        await logActivity(entityRef.current || result.entity)
      }
      jobsRef.current.delete(pendingId)
    } catch (err) {
      if (cancelledRef.current.has(pendingId)) return
      const latest = entityRef.current || entityAtEnqueue
      const failedPhotos = updatePhotoInList(latest?.photos || [], pendingId, {
        _uploadStatus: UPLOAD_STATUS.FAILED,
        _uploadError: err?.message || 'Upload failed',
      })
      applyEntityPhotos(latest, failedPhotos)
      showToast(err?.message || 'Photo upload failed', 'error')
    }
  }, [applyEntityPhotos, getToken, logActivity, uploadOne])

  const pumpQueue = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const job = queueRef.current.shift()
      activeCountRef.current += 1
      syncUploadingCount()
      runJob(job).finally(() => {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1)
        syncUploadingCount()
        pumpQueue()
      })
    }
    syncUploadingCount()
  }, [runJob, syncUploadingCount])

  const startUpload = useCallback((pendingId, source, entityAtEnqueue) => {
    jobsRef.current.set(pendingId, { source, entityAtEnqueue })
    queueRef.current.push({ pendingId, source, entityAtEnqueue })
    pumpQueue()
  }, [pumpQueue])

  const enqueue = useCallback((source, entity, meta = {}) => {
    if (!entity || !source) return null

    const estimatedBytes = meta.estimatedBytes ?? estimatePhotoBytes(source)
    let localPreviewUrl = meta.localPreviewUrl
    if (!localPreviewUrl) {
      if (typeof source === 'string') {
        localPreviewUrl = source
      } else if (typeof File !== 'undefined' && source instanceof File) {
        localPreviewUrl = URL.createObjectURL(source)
      }
    }

    const pending = createPendingPhoto({
      localPreviewUrl,
      estimatedBytes,
      capturedByUid: meta.capturedByUid ?? null,
      capturedByName: meta.capturedByName ?? null,
      addressLabel: meta.addressLabel ?? null,
      parcelId: meta.parcelId ?? null,
      lat: meta.lat ?? null,
      lng: meta.lng ?? null,
    })

    entityRef.current = entity
    cancelledRef.current.delete(pending.id)

    const photos = [...(entity.photos || []), pending]
    applyEntityPhotos(entity, photos)
    startUpload(pending.id, source, entityRef.current)
    return pending.id
  }, [applyEntityPhotos, startUpload])

  const cancel = useCallback((photoId) => {
    if (!photoId) return
    cancelledRef.current.add(photoId)
    queueRef.current = queueRef.current.filter((j) => j.pendingId !== photoId)

    const latest = entityRef.current
    const photo = latest?.photos?.find((p) => p.id === photoId)
    if (photo) revokeLocalPreview(photo)
    if (latest) {
      applyEntityPhotos(latest, removePhotoFromList(latest.photos, photoId))
    }
    jobsRef.current.delete(photoId)
    syncUploadingCount()
  }, [applyEntityPhotos, syncUploadingCount])

  const retry = useCallback((photoId) => {
    const latest = entityRef.current
    const photo = latest?.photos?.find((p) => p.id === photoId)
    const job = jobsRef.current.get(photoId)
    if (!photo || !job?.source || !latest) return

    cancelledRef.current.delete(photoId)
    const retrying = updatePhotoInList(latest.photos, photoId, {
      _uploadStatus: UPLOAD_STATUS.UPLOADING,
      _uploadError: null,
    })
    applyEntityPhotos(latest, retrying)
    startUpload(photoId, job.source, entityRef.current)
  }, [applyEntityPhotos, startUpload])

  const optimisticDelete = useCallback(async (photo, deleteOne) => {
    if (!photo?.id) return
    if (isPendingPhoto(photo)) {
      cancel(photo.id)
      return
    }

    const entity = entityRef.current
    if (!entity) return

    const photos = entity.photos || []
    const index = photos.findIndex((p) => p.id === photo.id)
    if (index === -1) return

    const snapshot = { photo, index }
    applyEntityPhotos(entity, removePhotoFromList(photos, photo.id))

    try {
      const result = await deleteOne()
      if (result?.entity) {
        entityRef.current = result.entity
        onEntityUpdated?.(result.entity)
      }
    } catch (err) {
      const latest = entityRef.current || entity
      applyEntityPhotos(latest, insertPhotoInList(latest.photos || [], snapshot.photo, snapshot.index))
      showToast(err?.message || 'Delete failed', 'error')
    }
  }, [applyEntityPhotos, cancel, onEntityUpdated])

  const setEntity = useCallback((entity) => {
    entityRef.current = entity
  }, [])

  useEffect(() => () => {
    const latest = entityRef.current
    ;(latest?.photos || []).forEach((photo) => {
      if (isPendingPhoto(photo)) revokeLocalPreview(photo)
    })
  }, [])

  return {
    enqueue,
    cancel,
    retry,
    optimisticDelete,
    setEntity,
    uploadingCount,
  }
}
