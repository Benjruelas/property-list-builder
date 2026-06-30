/**
 * Local photo blob mirror for dev — survives R2 misconfig and vercel dev isolation.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { shouldMirrorToLocalFiles } from './localDevPersistence.js'

const ROOT = path.join(process.cwd(), '.local-dev-data', 'photo-blobs')

export function localPhotoStorageEnabled() {
  return shouldMirrorToLocalFiles()
}

function filePathForKey(key) {
  const normalized = String(key || '').replace(/\.\./g, '').replace(/^\/+/, '')
  return path.join(ROOT, normalized)
}

export async function writeLocalPhotoBlob(key, buf) {
  if (!localPhotoStorageEnabled()) return
  const fp = filePathForKey(key)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, buf)
}

export async function readLocalPhotoBlob(key) {
  if (!localPhotoStorageEnabled()) return null
  try {
    const buf = await fs.readFile(filePathForKey(key))
    return buf.length ? buf : null
  } catch {
    return null
  }
}

export async function localPhotoBlobExists(key) {
  const buf = await readLocalPhotoBlob(key)
  return !!buf
}

export async function deleteLocalPhotoBlob(key) {
  if (!localPhotoStorageEnabled()) return
  try {
    await fs.unlink(filePathForKey(key))
  } catch {
    /* ignore */
  }
}
