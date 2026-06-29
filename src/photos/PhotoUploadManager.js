import { compressImageFile, compressDataUrl } from '@/utils/imageCompress'
import { entityKey, apiBodyFromRef, isDraftRef } from './entityRef'
import { blurHashFromBlob } from './blurHashUtils'
import {
  saveJob,
  saveBlobs,
  getBlobs,
  deleteJob,
  loadAllJobs,
  updateJob,
} from './photoStoreIdb'
import {
  presignUpload,
  completeUpload,
  assertPhotoStorage,
} from './photosClient'

export const JOB_STATUS = {
  queued: 'queued',
  uploading: 'uploading',
  done: 'done',
  failed: 'failed',
}

function newJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

class PhotoUploadManager {
  constructor() {
    this.jobs = new Map()
    this.listeners = new Set()
    this.getToken = null
    this.onEntityUpdated = null
    this.processing = false
    this.hydrated = false
    this._boundOnline = () => this.start()
    this._boundVisible = () => {
      if (document.visibilityState === 'visible') this.start()
    }
  }

  configure({ getToken, onEntityUpdated }) {
    this.getToken = getToken
    this.onEntityUpdated = onEntityUpdated
  }

  subscribe(fn) {
    this.listeners.add(fn)
    fn(this.getSnapshot())
    return () => this.listeners.delete(fn)
  }

  emit() {
    const snap = this.getSnapshot()
    for (const fn of this.listeners) fn(snap)
  }

  getSnapshot() {
    return Array.from(this.jobs.values())
  }

  getJobsForEntity(ref) {
    const key = entityKey(ref)
    return this.getSnapshot().filter((j) => j.entityKey === key && j.status !== JOB_STATUS.done)
  }

  async hydrate() {
    if (this.hydrated) return
    this.hydrated = true
    const stored = await loadAllJobs()
    for (const job of stored) {
      if (job.status === JOB_STATUS.done) {
        await deleteJob(job.jobId)
        continue
      }
      this.jobs.set(job.jobId, job)
    }
    this.emit()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._boundOnline)
      document.addEventListener('visibilitychange', this._boundVisible)
    }
    this.start()
  }

  async enqueueCapture(source, entityRef, metadata = {}, existingPhotos = []) {
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
    await saveJob(job)
    await saveBlobs(jobId, { thumb: compressed.thumbnail, full: compressed.file })
    this.emit()
    this.start()
    return job
  }

  async reassignDraftJobs(draftEntityId, newEntityRef) {
    const draftKey = entityKey({ entityType: 'lead', leadId: draftEntityId })
    const newKey = entityKey(newEntityRef)
    for (const job of this.jobs.values()) {
      if (job.entityKey === draftKey && job.status !== JOB_STATUS.done) {
        job.entityKey = newKey
        job.entityRef = { ...newEntityRef }
        await saveJob(job)
      }
    }
    this.emit()
    this.start()
  }

  async retry(jobId) {
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
    this.jobs.delete(jobId)
    deleteJob(jobId)
    this.emit()
  }

  async start() {
    if (this.processing || !this.getToken) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    const pending = this.getSnapshot().filter(
      (j) => j.status === JOB_STATUS.queued || j.status === JOB_STATUS.failed,
    )
    if (!pending.length) return

    this.processing = true
    try {
      for (const job of pending) {
        if (job.status === JOB_STATUS.failed) {
          job.status = JOB_STATUS.queued
          job.error = null
        }
        if (isDraftRef(job.entityRef)) continue
        await this.processJob(job)
      }
    } finally {
      this.processing = false
    }
    this.start()
  }

  async processJob(job) {
    const blobs = await getBlobs(job.jobId)
    if (!blobs?.thumb || !blobs?.full) {
      job.status = JOB_STATUS.failed
      job.error = 'Local photo data missing'
      await saveJob(job)
      this.emit()
      return
    }

    job.status = JOB_STATUS.uploading
    job.progress = 0.1
    await saveJob(job)
    this.emit()

    try {
      const presign = await presignUpload(this.getToken, job.entityRef, {
        contentType: 'image/jpeg',
        width: job.width,
        height: job.height,
        blurHash: job.blurHash,
        ...job.metadata,
      })

      job.progress = 0.3
      this.emit()

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

      if (!origRes.ok || !thumbRes.ok) {
        throw new Error('Storage upload failed')
      }

      job.progress = 0.7
      this.emit()

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
      await deleteJob(job.jobId)
      this.jobs.delete(job.jobId)
      this.emit()

      const entity = result.lead || result.deal
      if (entity && this.onEntityUpdated) {
        this.onEntityUpdated(job.entityRef, entity)
      }
    } catch (e) {
      job.status = JOB_STATUS.failed
      job.error = e.message || 'Upload failed'
      await saveJob(job)
      this.emit()
    }
  }
}

export const photoUploadManager = new PhotoUploadManager()
