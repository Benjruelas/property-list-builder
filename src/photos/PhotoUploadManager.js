import { compressImageFile, compressDataUrl } from '@/utils/imageCompress'
import { entityKey, isDraftRef } from './entityRef'
import { blurHashFromBlob } from './blurHashUtils'
import {
  saveJob,
  saveBlobs,
  getBlobs,
  deleteJob,
  loadAllJobs,
} from './photoStoreIdb'
import {
  backupPhotoBlobs,
  restorePhotoBlobs,
  clearPhotoBackup,
} from './photoNativeBackup'
import {
  presignUpload,
  completeUpload,
  uploadBytesViaApi,
  PHOTO_DIRECT_R2_UPLOAD,
  assertPhotoStorage,
} from './photosClient'
import { photoLog, photoLogError, photoLogWarn } from './photoDebug'

export const JOB_STATUS = {
  queued: 'queued',
  uploading: 'uploading',
  done: 'done',
  failed: 'failed',
}

/** Stable empty snapshot for useSyncExternalStore entity subscriptions. */
const EMPTY_ENTITY_JOBS = Object.freeze([])

function newJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

class PhotoUploadManager {
  constructor() {
    this.jobs = new Map()
    this.blobCache = new Map()
    this.listeners = new Set()
    this.getToken = null
    this.onEntityUpdated = null
    this.processing = false
    this.hydrated = false
    this.inFlight = new Set()
    this._drainPromise = null
    this.concurrency = 2
    this.entityListeners = new Map()
    this.entityJobsCache = new Map()
    this.jobsRevision = 0
    this._boundOnline = () => {
      photoLog('queue.online', 'Network online — resuming upload queue')
      this.start()
    }
    this._boundVisible = () => {
      if (document.visibilityState === 'visible') {
        photoLog('queue.visible', 'App visible — resuming upload queue')
        this.start()
      }
    }
  }

  configure({ getToken, onEntityUpdated, concurrency = 2 }) {
    this.getToken = getToken
    this.onEntityUpdated = onEntityUpdated
    this.concurrency = Math.max(1, Math.min(3, concurrency || 2))
    photoLog('queue.configure', 'Upload manager configured', { hasGetToken: !!getToken })
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      window.__photoPipelineDump = () => ({
        at: new Date().toISOString(),
        processing: this.processing,
        hydrated: this.hydrated,
        jobs: this.getSnapshot(),
      })
    }
  }

  subscribe(fn) {
    this.listeners.add(fn)
    fn(this.getSnapshot())
    return () => this.listeners.delete(fn)
  }

  subscribeEntity(entityKey, fn) {
    if (!this.entityListeners.has(entityKey)) this.entityListeners.set(entityKey, new Set())
    const set = this.entityListeners.get(entityKey)
    set.add(fn)
    fn()
    return () => set.delete(fn)
  }

  emitEntity(entityKey) {
    const set = this.entityListeners.get(entityKey)
    if (!set) return
    for (const fn of set) fn()
  }

  invalidateJobsCache() {
    this.jobsRevision += 1
    this.entityJobsCache.clear()
  }

  emit() {
    this.invalidateJobsCache()
    const snap = this.getSnapshot()
    for (const fn of this.listeners) fn(snap)
    const keys = new Set(snap.map((j) => j.entityKey))
    for (const key of keys) this.emitEntity(key)
  }

  getSnapshot() {
    return Array.from(this.jobs.values())
  }

  getJobsForEntity(ref) {
    const key = entityKey(ref)
    if (!key || key === 'lead:' || key.startsWith('deal::')) return EMPTY_ENTITY_JOBS

    const cached = this.entityJobsCache.get(key)
    if (cached && cached.revision === this.jobsRevision) {
      return cached.jobs
    }

    const jobs = this.getSnapshot().filter(
      (j) => j.entityKey === key && j.status !== JOB_STATUS.done,
    )
    const snapshot = jobs.length === 0 ? EMPTY_ENTITY_JOBS : jobs
    this.entityJobsCache.set(key, { revision: this.jobsRevision, jobs: snapshot })
    return snapshot
  }

  async normalizeStaleJobs() {
    for (const job of this.jobs.values()) {
      if (job.status === JOB_STATUS.uploading) {
        job.status = JOB_STATUS.queued
        job.progress = 0
        await saveJob(job)
        photoLog('queue.normalize', 'Reset stale uploading job to queued', { jobId: job.jobId })
      }
    }
  }

  async hydrate() {
    if (this.hydrated) return
    this.hydrated = true
    photoLog('queue.hydrate', 'Loading persisted jobs from IndexedDB')
    const stored = await loadAllJobs()
    photoLog('queue.hydrate', 'IndexedDB jobs loaded', { count: stored.length })
    for (const job of stored) {
      if (job.status === JOB_STATUS.done) {
        await deleteJob(job.jobId)
        continue
      }
      this.jobs.set(job.jobId, job)
    }
    await this.normalizeStaleJobs()
    this.emit()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._boundOnline)
      document.addEventListener('visibilitychange', this._boundVisible)
    }
    this.start()
  }

  async enqueueCapture(source, entityRef, metadata = {}, existingPhotos = []) {
    photoLog('queue.enqueue', 'Compressing capture', {
      entityKey: entityKey(entityRef),
      sourceType: typeof source === 'string' ? 'dataUrl' : 'file',
      isDraft: isDraftRef(entityRef),
    })
    let compressed
    if (typeof source === 'string') {
      compressed = await compressDataUrl(source)
    } else {
      compressed = await compressImageFile(source)
    }

    const addingBytes = compressed.file.size + compressed.thumbnail.size
    const entityType = entityRef.entityType || (entityRef.dealId ? 'deal' : 'lead')
    assertPhotoStorage(entityType, existingPhotos, addingBytes)

    const blurHash = await blurHashFromBlob(compressed.thumbnail)
    const jobId = newJobId()
    const job = {
      jobId,
      entityKey: entityKey(entityRef),
      entityRef: { ...entityRef },
      entityType,
      status: JOB_STATUS.queued,
      blurHash,
      metadata,
      width: compressed.width,
      height: compressed.height,
      size: compressed.file.size,
      thumbnailSize: compressed.thumbnail.size,
      error: null,
      photoId: null,
      createdAt: Date.now(),
      progress: 0,
    }

    this.jobs.set(jobId, job)
    this.blobCache.set(jobId, { thumb: compressed.thumbnail, full: compressed.file })
    await saveJob(job)
    await saveBlobs(jobId, { thumb: compressed.thumbnail, full: compressed.file })
    // Native secondary store — survives WebView IDB eviction in the field.
    backupPhotoBlobs(jobId, { thumb: compressed.thumbnail, full: compressed.file }).catch(() => {})
    photoLog('queue.enqueue', 'Job queued', {
      jobId,
      entityKey: job.entityKey,
      size: job.size,
      thumbnailSize: job.thumbnailSize,
      isDraft: isDraftRef(entityRef),
    })
    this.emit()
    this.start()
    return job
  }

  async reassignDraftJobs(draftEntityId, newEntityRef) {
    const draftKey = entityKey({ entityType: 'lead', leadId: draftEntityId })
    const newKey = entityKey(newEntityRef)
    photoLog('queue.reassign', 'Moving draft jobs to saved lead', { draftKey, newKey })
    let count = 0
    for (const job of this.jobs.values()) {
      if (job.entityKey === draftKey && job.status !== JOB_STATUS.done) {
        job.entityKey = newKey
        job.entityRef = { ...newEntityRef }
        await saveJob(job)
        count += 1
      }
    }
    photoLog('queue.reassign', 'Draft jobs reassigned', { count, newKey })
    this.emit()
    this.start()
  }

  async retry(jobId) {
    photoLog('queue.retry', 'Retry requested', { jobId })
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = JOB_STATUS.queued
    job.error = null
    job.progress = 0
    await saveJob(job)
    this.emit()
    this.start()
  }

  removeJob(jobId) {
    photoLog('queue.remove', 'Job removed', { jobId })
    this.jobs.delete(jobId)
    this.blobCache.delete(jobId)
    deleteJob(jobId)
    clearPhotoBackup(jobId).catch(() => {})
    this.emit()
  }

  async start() {
    if (this._drainPromise) {
      photoLog('queue.start', 'Drain already running — skip')
      return this._drainPromise
    }
    this._drainPromise = this.drainQueue()
    try {
      await this._drainPromise
    } finally {
      this._drainPromise = null
    }
  }

  async drainQueue() {
    if (!this.getToken) {
      photoLogWarn('queue.start', 'No getToken — uploads paused')
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      photoLogWarn('queue.start', 'Offline — uploads paused')
      return
    }

    const draftPending = this.getSnapshot().filter(
      (j) => (j.status === JOB_STATUS.queued || j.status === JOB_STATUS.failed)
        && isDraftRef(j.entityRef),
    )
    if (draftPending.length) {
      photoLog('queue.start', 'Draft jobs waiting for lead save', {
        count: draftPending.length,
        jobIds: draftPending.map((j) => j.jobId),
      })
    }

    while (true) {
      const queue = this.getSnapshot().filter(
        (j) => j.status === JOB_STATUS.queued && !isDraftRef(j.entityRef),
      )
      if (!queue.length) break

      const batch = queue.slice(0, this.concurrency)
      photoLog('queue.start', 'Processing upload batch', {
        count: batch.length,
        concurrency: this.concurrency,
        jobIds: batch.map((j) => j.jobId),
      })

      this.processing = true
      try {
        await Promise.all(batch.map((job) => this.processJob(job)))
      } finally {
        this.processing = false
      }
    }
  }

  async putBlobsToStorage(job, presign, blobs) {
    const canDirectPut = PHOTO_DIRECT_R2_UPLOAD
      && presign.uploadUrl
      && presign.thumbnailUploadUrl

    if (canDirectPut) {
      try {
        photoLog('queue.put', 'Uploading to R2 (direct)', { jobId: job.jobId, photoId: presign.photoId })
        const [origRes, thumbRes] = await Promise.all([
          fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blobs.full,
          }),
          fetch(presign.thumbnailUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blobs.thumb,
          }),
        ])
        if (origRes.ok && thumbRes.ok) {
          photoLog('queue.put', 'R2 PUT OK', { jobId: job.jobId, photoId: presign.photoId })
          return
        }
        photoLogWarn('queue.put', 'Direct R2 PUT failed — using API proxy', {
          jobId: job.jobId,
          originalStatus: origRes.status,
          thumbnailStatus: thumbRes.status,
        })
      } catch (err) {
        photoLogWarn('queue.put', 'Direct R2 PUT failed — using API proxy', {
          jobId: job.jobId,
          reason: err?.message || 'unknown',
        })
      }
    }

    photoLog('queue.put', 'Uploading via API proxy', { jobId: job.jobId, photoId: presign.photoId })
    await uploadBytesViaApi(this.getToken, job.entityRef, presign.key, blobs.full)
    await uploadBytesViaApi(this.getToken, job.entityRef, presign.thumbnailKey, blobs.thumb)
    photoLog('queue.put', 'API proxy upload OK', { jobId: job.jobId, photoId: presign.photoId })
  }

  async processJob(job) {
    if (job.status !== JOB_STATUS.queued) {
      photoLog('queue.process', 'Skip — job not queued', { jobId: job.jobId, status: job.status })
      return
    }
    if (this.inFlight.has(job.jobId)) {
      photoLog('queue.process', 'Skip — job already in flight', { jobId: job.jobId })
      return
    }

    this.inFlight.add(job.jobId)
    job.status = JOB_STATUS.uploading
    job.progress = 0.1
    job.error = null
    this.emit()

    photoLog('queue.process', 'Job started', { jobId: job.jobId, entityKey: job.entityKey })

    try {
      const cached = this.blobCache.get(job.jobId)
      let blobs = cached || await getBlobs(job.jobId)
      if (!blobs?.thumb || !blobs?.full) {
        const restored = await restorePhotoBlobs(job.jobId)
        if (restored?.thumb && restored?.full) {
          blobs = restored
          this.blobCache.set(job.jobId, restored)
          await saveBlobs(job.jobId, restored).catch(() => {})
          photoLog('queue.process', 'Restored blobs from native filesystem', { jobId: job.jobId })
        }
      }
      if (!blobs?.thumb || !blobs?.full) {
        photoLogError('queue.process', 'Local blobs missing', null, { jobId: job.jobId, hadCache: !!cached })
        job.status = JOB_STATUS.failed
        job.error = 'Local photo data missing'
        await saveJob(job)
        this.emit()
        return
      }

      await saveJob(job)
      photoLog('queue.presign', 'Requesting presigned URLs', { jobId: job.jobId, photoId: job.photoId })
      const presign = await presignUpload(this.getToken, job.entityRef, {
        photoId: job.photoId || undefined,
        contentType: 'image/jpeg',
        width: job.width,
        height: job.height,
        blurHash: job.blurHash,
        ...job.metadata,
      })
      if (!job.photoId) {
        job.photoId = presign.photoId
        await saveJob(job)
      }
      photoLog('queue.presign', 'Presign OK', {
        jobId: job.jobId,
        photoId: presign.photoId,
        key: presign.key,
      })

      job.progress = 0.3
      this.emit()

      await this.putBlobsToStorage(job, presign, blobs)

      job.progress = 0.7
      this.emit()

      photoLog('queue.complete', 'Recording photo metadata', { jobId: job.jobId, photoId: presign.photoId })
      const result = await completeUpload(this.getToken, job.entityRef, {
        photoId: presign.photoId,
        key: presign.key,
        thumbnailKey: presign.thumbnailKey,
        size: job.size,
        thumbnailSize: job.thumbnailSize,
        contentType: 'image/jpeg',
        width: job.width,
        height: job.height,
        blurHash: job.blurHash,
        ...job.metadata,
      })

      job.status = JOB_STATUS.done
      job.photoId = presign.photoId
      job.progress = 1
      this.blobCache.delete(job.jobId)
      await deleteJob(job.jobId)
      clearPhotoBackup(job.jobId).catch(() => {})
      this.jobs.delete(job.jobId)
      this.emit()

      const entity = result.lead || result.deal
      photoLog('queue.done', 'Upload complete', {
        jobId: job.jobId,
        photoId: presign.photoId,
        entityType: job.entityType,
        photoCount: entity?.photos?.length,
      })
      if (entity && this.onEntityUpdated) {
        this.onEntityUpdated(job.entityRef, entity)
      }
    } catch (e) {
      photoLogError('queue.failed', 'Upload failed', e, {
        jobId: job.jobId,
        hint: e?.message === 'Failed to fetch'
          ? 'Browser blocked R2 PUT — add CORS rules on your R2 bucket for this origin'
          : undefined,
      })
      job.status = JOB_STATUS.failed
      job.error = e.message || 'Upload failed'
      await saveJob(job)
      this.emit()
    } finally {
      this.inFlight.delete(job.jobId)
    }
  }
}

export const photoUploadManager = new PhotoUploadManager()
