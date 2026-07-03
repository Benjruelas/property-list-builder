/**
 * Remove stored blobs when a lead is deleted (photos, attachments).
 */

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { deleteLocalPhotoBlob } from './photoBlobStore.js'
import { presignedPhotosEnabled } from './photoPresign.js'

let _s3

function s3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

export async function deleteStorageKey(key) {
  if (!key || typeof key !== 'string') return
  await deleteLocalPhotoBlob(key)
  if (!presignedPhotosEnabled()) return
  try {
    await s3().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
  } catch (e) {
    if (e.name !== 'NoSuchKey') console.warn('delete storage key', key, e.message)
  }
}

function photoStorageKeys(photo) {
  return [
    photo?.key,
    photo?.thumbnailKey,
    photo?.annotatedKey,
    photo?.annotatedThumbnailKey,
  ].filter(Boolean)
}

export async function deleteLeadContentFromStorage(lead) {
  if (!lead) return
  const photos = Array.isArray(lead.photos) ? lead.photos : []
  for (const photo of photos) {
    for (const key of photoStorageKeys(photo)) {
      await deleteStorageKey(key)
    }
  }
  const files = Array.isArray(lead.files) ? lead.files : []
  for (const file of files) {
    if (file?.key) await deleteStorageKey(file.key)
  }
}
