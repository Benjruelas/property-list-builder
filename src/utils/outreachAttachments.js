import { MAX_SINGLE_UPLOAD_BYTES, formatStorageBytes } from './uploadLimits'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmailAddress(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim())
}

export function normalizeEmailAddress(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function sumAttachmentBytes(files) {
  return (Array.isArray(files) ? files : []).reduce((sum, f) => sum + (Number(f.size) || 0), 0)
}

export function validateAttachmentTotalSize(existingFiles, incomingFiles, maxBytes = MAX_SINGLE_UPLOAD_BYTES) {
  const total = sumAttachmentBytes(existingFiles) + sumAttachmentBytes(incomingFiles)
  if (total <= maxBytes) return null
  return `Attachments must be ${formatStorageBytes(maxBytes)} or less (currently ${formatStorageBytes(total)})`
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * @param {FileList|File[]} fileList
 * @returns {Promise<Array<{ filename: string, contentBase64: string, contentType: string, size: number }>>}
 */
export async function readFilesAsAttachments(fileList) {
  const files = Array.from(fileList || [])
  const out = []
  for (const file of files) {
    if (!file?.name) continue
    const contentBase64 = await readFileAsBase64(file)
    out.push({
      filename: file.name,
      contentBase64,
      contentType: file.type || 'application/octet-stream',
      size: file.size || 0,
    })
  }
  return out
}
