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
