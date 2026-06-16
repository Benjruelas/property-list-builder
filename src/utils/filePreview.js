/**
 * File preview helpers — MIME/extension detection and blob URL management.
 */

import { getModalPortalContainer } from './modalPortal.js'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const PDF_EXT = /\.pdf$/i
const TEXT_EXT = /\.(txt|csv|md|log)$/i

export function resolvePreviewKind({ contentType = '', fileName = '' } = {}) {
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim()
  const name = String(fileName || '').toLowerCase()

  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image'
  if (mime === 'application/pdf' || PDF_EXT.test(name)) return 'pdf'
  if (mime.startsWith('text/') || TEXT_EXT.test(name)) return 'text'
  return 'unsupported'
}

export async function fetchAuthenticatedBlob(getToken, url) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Could not load file')
  return res.blob()
}

export function createPreviewSource(input) {
  if (!input) return { url: null, revoke: () => {} }
  if (typeof input === 'string' && input.startsWith('data:')) {
    return { url: input, revoke: () => {} }
  }
  if (input instanceof Blob) {
    const url = URL.createObjectURL(input)
    return { url, revoke: () => URL.revokeObjectURL(url) }
  }
  return { url: null, revoke: () => {} }
}

export const MAX_TEXT_PREVIEW_CHARS = 200_000

export async function readTextFromBlob(blob, maxChars = MAX_TEXT_PREVIEW_CHARS) {
  const text = await blob.text()
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n… (truncated)`
}

/** Body-only portals render under #modal-root — use this for fullscreen overlays. */
export function getFilePreviewPortalContainer() {
  return getModalPortalContainer()
}

export function triggerBlobDownload(blob, fileName) {
  const { url, revoke } = createPreviewSource(blob)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'download'
  a.click()
  if (blob instanceof Blob) revoke()
}
