/**
 * Deal file upload/download client.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

export { MAX_FILE_BYTES }

export async function uploadDealFile(getToken, { pipelineId, dealId, file }) {
  if (!file) throw new Error('No file selected')
  if (file.size > MAX_FILE_BYTES) throw new Error('File must be 10MB or smaller')

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

export async function downloadDealFile(getToken, key, fileName) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to download files')
  const res = await fetch(`${getApiBase()}/deal-files?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'download'
  a.click()
  URL.revokeObjectURL(url)
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
