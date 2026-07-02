/**
 * Deal file upload/download client.
 */

import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumDealFileBytes,
} from './uploadLimits'
import { fetchAuthenticatedBlob, triggerBlobDownload } from './filePreview'

import { getApiBase } from './apiBase'

export const DEAL_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.deal

export {
  MAX_SINGLE_UPLOAD_BYTES,
  sumDealFileBytes,
  formatStorageBytes,
}

export async function uploadDealFile(getToken, { pipelineId, dealId, file, existingFiles = [] }) {
  if (!file) throw new Error('No file selected')
  if (file.size > MAX_SINGLE_UPLOAD_BYTES) {
    throw new Error(`Each upload must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`)
  }

  const used = sumDealFileBytes(existingFiles)
  if (used + file.size > ENTITY_STORAGE_LIMITS.deal) {
    throw new Error(entityStorageError('deal', ENTITY_STORAGE_LIMITS.deal))
  }

  const token = await getToken()
  if (!token) throw new Error('Sign in to upload files')

  // Preferred path: presigned direct-to-R2 PUT (no base64 through the API).
  try {
    const presignRes = await fetch(`${getApiBase()}/deal-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'presign',
        pipelineId,
        dealId,
        fileName: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
      }),
    })
    if (presignRes.ok) {
      const { uploadUrl, file: record } = await presignRes.json()
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!putRes.ok) throw new Error('Direct upload failed')
      return record
    }
    if (presignRes.status !== 503) {
      const err = await presignRes.json().catch(() => ({}))
      throw new Error(err.error || 'Upload failed')
    }
    // 503 = direct upload not configured; fall through to base64 path.
  } catch (e) {
    if (e.message && e.message !== 'Direct upload failed' && !/not configured/i.test(e.message)) {
      // Real validation/permission error from presign — surface it.
      if (!/failed to fetch/i.test(e.message)) throw e
    }
  }

  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const fileBase64 = btoa(binary)

  const res = await fetch(`${getApiBase()}/deal-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      pipelineId,
      dealId,
      fileName: file.name,
      fileBase64,
      contentType: file.type || 'application/octet-stream',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  const data = await res.json()
  return data.file
}

export function dealFileUrl(key) {
  if (!key) return ''
  return `${getApiBase()}/deal-files?key=${encodeURIComponent(key)}`
}

export async function fetchDealFileBlob(getToken, key) {
  // Preferred path: resolve a presigned R2 URL, then fetch bytes directly from
  // R2 so the function doesn't proxy the download.
  try {
    const token = await getToken()
    if (token) {
      const res = await fetch(`${dealFileUrl(key)}&format=url`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const { url } = await res.json()
        if (url) {
          const fileRes = await fetch(url)
          if (fileRes.ok) return await fileRes.blob()
        }
      }
    }
  } catch {
    /* fall back to proxied download */
  }
  return fetchAuthenticatedBlob(getToken, dealFileUrl(key))
}

export async function downloadDealFile(getToken, key, fileName) {
  const blob = await fetchDealFileBlob(getToken, key)
  triggerBlobDownload(blob, fileName)
}

export async function deleteDealFile(getToken, { key, pipelineId }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete files')
  const res = await fetch(`${getApiBase()}/deal-files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, pipelineId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Delete failed')
  }
}
