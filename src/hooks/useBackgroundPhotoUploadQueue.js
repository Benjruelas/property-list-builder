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
import { deferRevokeObjectURL } from '@/utils/blobUrl'

const MAX_CONCURRENT = 2
// Keep a deleted photo hidden until any background list poll that was already
// in flight has resolved, so a stale refresh can't briefly resurface it.
const DELETE_SETTLE_MS = 35000

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
  // Photos the user has deleted but whose removal may not yet be reflected by
  // background list refreshes. Display + entity writes filter these out so a
  // deleted photo never flickers back into the grid.
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set())
  const pendingDeleteIdsRef = useRef(pendingDeleteIds)
  pendingDeleteIdsRef.current = pendingDeleteIds
  // Serialize server deletes so concurrent read-modify-write requests can't
  // clobber each other and leave a "deleted" photo on the server.
  const deleteChainRef = useRef(Promise.resolve())
  const deleteTimersRef = useRef(new Map())

  const syncUploadingCount = useCallback(() => {
    setUploadingCount(activeCountRef.current + queueRef.current.length)
  }, [])

  const markDeleting = useCallback((id) => {
    setPendingDeleteIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const unmarkDeleting = useCallback((id) => {
    const timer = deleteTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      deleteTimersRef.current.delete(id)
    }
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const filterDeleting = useCallback((photos) => {
    const deleting = pendingDeleteIdsRef.current
    if (!deleting.size) return photos
    return (Array.isArray(photos) ? photos : []).filter((p) => !deleting.has(p.id))
  }, [])

  const applyEntityPhotos = useCallback((entity, photos) => {
    if (!entity) return
    const next = {
      ...entity,
      photos: filterDeleting(photos),
      updatedAt: new Date().toISOString(),
    }
    entityRef.current = next
    onEntityUpdated?.(next)
  }, [onEntityUpdated, filterDeleting])

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
      const pendingPreviewUrl = pending?._localPreviewUrl

      // Carry the just-uploaded thumbnail forward so the photo keeps showing its
      // image instantly. Otherwise it would briefly have no preview and depend on
      // a server thumbnail fetch that competes with the rest of the batch upload —
      // the cause of a few photos spinning endlessly after a bulk capture.
      let serverPhoto = result.photo
      if (result.thumbnailBlob && typeof URL !== 'undefined' && URL.createObjectURL) {
        try {
          serverPhoto = { ...serverPhoto, _freshThumbUrl: URL.createObjectURL(result.thumbnailBlob) }
        } catch { /* ignore - fall back to server fetch */ }
      }

      const mergedPhotos = replacePhotoInList(latest?.photos || [], pendingId, serverPhoto)
      applyEntityPhotos(latest, mergedPhotos)
      if (pendingPreviewUrl) deferRevokeObjectURL(pendingPreviewUrl)

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

  const optimisticDelete = useCallback((photo, deleteOne) => {
    if (!photo?.id) return Promise.resolve({ ok: true })
    if (isPendingPhoto(photo)) {
      cancel(photo.id)
      return Promise.resolve({ ok: true })
    }

    const entity = entityRef.current
    if (!entity) return Promise.resolve({ ok: false })

    const photos = entity.photos || []
    const index = photos.findIndex((p) => p.id === photo.id)
    if (index === -1) return Promise.resolve({ ok: true })

    const snapshot = { photo, index }
    markDeleting(photo.id)
    applyEntityPhotos(entity, removePhotoFromList(photos, photo.id))

    const run = deleteChainRef.current.then(async () => {
      try {
        const result = await deleteOne()
        if (result?.entity) {
          applyEntityPhotos(result.entity, result.entity.photos || [])
        }
        // Keep it filtered briefly so an already in-flight poll can't resurface it.
        const timer = setTimeout(() => {
          deleteTimersRef.current.delete(photo.id)
          unmarkDeleting(photo.id)
        }, DELETE_SETTLE_MS)
        deleteTimersRef.current.set(photo.id, timer)
        return { ok: true }
      } catch (err) {
        unmarkDeleting(photo.id)
        const latest = entityRef.current || entity
        applyEntityPhotos(latest, insertPhotoInList(latest.photos || [], snapshot.photo, snapshot.index))
        showToast(err?.message || 'Delete failed', 'error')
        return { ok: false }
      }
    })
    deleteChainRef.current = run.catch(() => {})
    return run
  }, [applyEntityPhotos, cancel, markDeleting, unmarkDeleting])

  const setEntity = useCallback((entity) => {
    if (!entity) {
      entityRef.current = entity
      return
    }
    const deleting = pendingDeleteIdsRef.current
    entityRef.current = deleting.size
      ? { ...entity, photos: (entity.photos || []).filter((p) => !deleting.has(p.id)) }
      : entity
  }, [])

  useEffect(() => () => {
    const latest = entityRef.current
    ;(latest?.photos || []).forEach((photo) => {
      if (isPendingPhoto(photo)) revokeLocalPreview(photo)
    })
    deleteTimersRef.current.forEach((timer) => clearTimeout(timer))
    deleteTimersRef.current.clear()
  }, [])

  return {
    enqueue,
    cancel,
    retry,
    optimisticDelete,
    setEntity,
    uploadingCount,
    pendingDeleteIds,
  }
}
