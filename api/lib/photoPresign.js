/**
 * Presigned R2 URLs for direct photo upload/download (bypasses function byte streaming).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { flags } from './flags.js'

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

function bucket() {
  return process.env.R2_BUCKET_NAME
}

export function presignedPhotosEnabled() {
  return flags.PRESIGNED_PHOTOS() && !!process.env.R2_BUCKET_NAME && !!process.env.R2_ACCOUNT_ID
}

export async function createPresignedPutUrl(key, contentType = 'image/jpeg', expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3(), command, { expiresIn })
}

export async function createPresignedGetUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  })
  return getSignedUrl(s3(), command, { expiresIn })
}

export default {
  presignedPhotosEnabled,
  createPresignedPutUrl,
  createPresignedGetUrl,
}
