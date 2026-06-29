import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { photoUploadManager } from './PhotoUploadManager'
import { entityKey } from './entityRef'

const PhotoUploadContext = createContext(null)

export function PhotoUploadProvider({ getToken, children, onEntityUpdated }) {
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    photoUploadManager.configure({ getToken, onEntityUpdated })
    photoUploadManager.hydrate()
    return photoUploadManager.subscribe(setJobs)
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
    [jobs],
  )

  const value = useMemo(() => ({
    jobs,
    enqueueCapture,
    retry,
    reassignDraftJobs,
    getJobsForEntity,
    entityKey,
  }), [jobs, enqueueCapture, retry, reassignDraftJobs, getJobsForEntity])

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

export function usePhotoUploadOptional() {
  return useContext(PhotoUploadContext)
}
