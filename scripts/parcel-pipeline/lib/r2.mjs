import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

let _s3

export function getR2() {
  if (_s3) return _s3
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required')
  }
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _s3
}

export function bucket() {
  return process.env.R2_BUCKET_NAME || 'parcel-tiles'
}

export async function getObjectBuffer(key) {
  try {
    const res = await getR2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
    const chunks = []
    for await (const chunk of res.Body) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null
    throw e
  }
}

export async function putObjectBuffer(key, body, contentType = 'application/x-protobuf') {
  await getR2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}
