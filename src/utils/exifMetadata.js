/**
 * EXIF GPS + capture-date extraction for bulk photo import.
 * Never throws — photos without usable EXIF just resolve with null fields
 * (falling back to the file's modified time for capturedAt).
 */
import { gps as exifrGps, parse as exifrParse } from 'exifr'

/**
 * @param {File} file
 * @returns {Promise<{ lat: number|null, lng: number|null, capturedAt: Date|null }>}
 */
export async function readPhotoExif(file) {
  let lat = null
  let lng = null
  let capturedAt = null

  try {
    const gps = await exifrGps(file)
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      lat = gps.latitude
      lng = gps.longitude
    }
  } catch {
    // No GPS block, or an unsupported file — leave lat/lng null.
  }

  try {
    const tags = await exifrParse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
    const raw = tags?.DateTimeOriginal || tags?.CreateDate
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      capturedAt = raw
    }
  } catch {
    // No parseable date tags.
  }

  if (!capturedAt && Number.isFinite(file?.lastModified)) {
    capturedAt = new Date(file.lastModified)
  }

  return { lat, lng, capturedAt }
}

/**
 * Reads EXIF for many files with bounded concurrency so a large "last 30 days"
 * batch doesn't stall the main thread.
 * @param {File[]} files
 * @param {{ concurrency?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<Array<{ file: File, lat: number|null, lng: number|null, capturedAt: Date|null }>>}
 */
export async function readPhotosExifBatch(files, { concurrency = 4, onProgress } = {}) {
  const results = new Array(files.length)
  let cursor = 0
  let completed = 0

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++
      const file = files[index]
      const exif = await readPhotoExif(file)
      results[index] = { file, ...exif }
      completed += 1
      onProgress?.(completed, files.length)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, files.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
