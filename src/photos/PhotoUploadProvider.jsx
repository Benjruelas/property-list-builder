import { createContext, useContext, useEffect, useMemo, useCallback } from 'react'
import { useSyncExternalStore } from 'react'
import { photoUploadManager } from './PhotoUploadManager'
import { entityKey } from './entityRef'

const PhotoUploadContext = createContext(null)

const UPLOAD_CONCURRENCY = 3

export function PhotoUploadProvider({ getToken, children, onEntityUpdated }) {
  useEffect(() => {
    photoUploadManager.configure({ getToken, onEntityUpdated, concurrency: UPLOAD_CONCURRENCY })
    photoUploadManager.hydrate()
  }, [getToken, onEntityUpdated])

  const enqueueCapture = useCallback(
    (source, entityRef, metadata, existingPhotos) =>
      photoUploadManager.enqueueCapture(source, entityRef, metadata, existingPhotos),
    [],
  )

  const retry = useCallback((jobId) => photoUploadManager.retry(jobId), [])
  const reassignDraftJobs = useCallback(
    (draftId, newRef) => photoUploadManager.reassignDraftJobs(draftId, newRef),
    [],
  )

  const getJobsForEntity = useCallback(
    (ref) => photoUploadManager.getJobsForEntity(ref),
    [],
  )

  const kickQueue = useCallback(() => photoUploadManager.start(), [])

  const value = useMemo(() => ({
    enqueueCapture,
    retry,
    reassignDraftJobs,
    getJobsForEntity,
    kickQueue,
    entityKey,
  }), [enqueueCapture, retry, reassignDraftJobs, getJobsForEntity, kickQueue])

  return (
    <PhotoUploadContext.Provider value={value}>
      {children}
    </PhotoUploadContext.Provider>
  )
}

export function usePhotoUpload() {
  const ctx = useContext(PhotoUploadContext)
  if (!ctx) throw new Error('usePhotoUpload requires PhotoUploadProvider')
  return ctx
}

/** Subscribe to upload jobs for one entity without rerendering the full app tree. */
export function useEntityUploadJobs(entityRef) {
  const key = entityKey(entityRef)
  return useSyncExternalStore(
    (cb) => photoUploadManager.subscribeEntity(key, cb),
    () => photoUploadManager.getJobsForEntity(entityRef),
    () => [],
  )
}

export function usePhotoUploadOptional() {
  return useContext(PhotoUploadContext)
}
