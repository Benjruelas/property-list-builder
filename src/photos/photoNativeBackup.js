/**
 * Durable on-device photo backup for Capacitor native builds.
 * IndexedDB is primary; Filesystem Cache is a secondary store so pending
 * uploads survive aggressive WebView storage eviction.
 */

import { Capacitor } from '@capacitor/core'
import { blobToBase64 } from '@/utils/imageCompress'

const BACKUP_DIR = 'pending_photos'

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function getFilesystem() {
  if (!isNative()) return null
  try {
    const mod = await import('@capacitor/filesystem')
    return { Filesystem: mod.Filesystem, Directory: mod.Directory }
  } catch {
    return null
  }
}

function base64FromDataUrl(dataUrl) {
  return String(dataUrl || '').replace(/^data:[^;]+;base64,/, '')
}

async function blobToRawBase64(blob) {
  const dataUrl = await blobToBase64(blob)
  return base64FromDataUrl(dataUrl)
}

function base64ToBlob(base64, contentType = 'image/jpeg') {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

/** Persist full + thumb blobs next to the IDB job. No-op on web. */
export async function backupPhotoBlobs(jobId, { full, thumb }) {
  const fs = await getFilesystem()
  if (!fs || !jobId || !full || !thumb) return
  const { Filesystem, Directory } = fs
  try {
    await Filesystem.mkdir({
      path: BACKUP_DIR,
      directory: Directory.Cache,
      recursive: true,
    }).catch(() => {})
    const [fullB64, thumbB64] = await Promise.all([
      blobToRawBase64(full),
      blobToRawBase64(thumb),
    ])
    await Promise.all([
      Filesystem.writeFile({
        path: `${BACKUP_DIR}/${jobId}_full.jpg`,
        data: fullB64,
        directory: Directory.Cache,
      }),
      Filesystem.writeFile({
        path: `${BACKUP_DIR}/${jobId}_thumb.jpg`,
        data: thumbB64,
        directory: Directory.Cache,
      }),
    ])
  } catch (e) {
    console.warn('[photoNativeBackup] write failed', e?.message || e)
  }
}

/** Restore blobs from Filesystem if IDB lost them. Returns null when unavailable. */
export async function restorePhotoBlobs(jobId) {
  const fs = await getFilesystem()
  if (!fs || !jobId) return null
  const { Filesystem, Directory } = fs
  try {
    const [fullFile, thumbFile] = await Promise.all([
      Filesystem.readFile({
        path: `${BACKUP_DIR}/${jobId}_full.jpg`,
        directory: Directory.Cache,
      }),
      Filesystem.readFile({
        path: `${BACKUP_DIR}/${jobId}_thumb.jpg`,
        directory: Directory.Cache,
      }),
    ])
    const fullB64 = typeof fullFile.data === 'string' ? fullFile.data : null
    const thumbB64 = typeof thumbFile.data === 'string' ? thumbFile.data : null
    if (!fullB64 || !thumbB64) return null
    return {
      full: base64ToBlob(fullB64),
      thumb: base64ToBlob(thumbB64),
    }
  } catch {
    return null
  }
}

/** Remove on-device backup after a successful upload. */
export async function clearPhotoBackup(jobId) {
  const fs = await getFilesystem()
  if (!fs || !jobId) return
  const { Filesystem, Directory } = fs
  await Promise.all([
    Filesystem.deleteFile({
      path: `${BACKUP_DIR}/${jobId}_full.jpg`,
      directory: Directory.Cache,
    }).catch(() => {}),
    Filesystem.deleteFile({
      path: `${BACKUP_DIR}/${jobId}_thumb.jpg`,
      directory: Directory.Cache,
    }).catch(() => {}),
  ])
}
