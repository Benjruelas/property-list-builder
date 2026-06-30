/**
 * File preview helpers — MIME/extension detection and blob URL management.
 */

import { getModalPortalContainer } from './modalPortal.js'
import { isNativeApp } from './apiBase.js'

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

export function isMobileDevice() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true
  return navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 768px)').matches
}

export function safeDownloadFileName(fileName, fallback = 'download') {
  const cleaned = String(fileName || fallback)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export function ensureImageFileName(fileName, mimeType = 'image/jpeg') {
  const base = safeDownloadFileName(fileName, 'photo')
  if (/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(base)) return base
  const ext = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/gif'
        ? 'gif'
        : 'jpg'
  const stem = base.replace(/\.[^.]+$/, '')
  return `${stem}.${ext}`
}

export function canShareImageFiles() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false
  try {
    const probe = new File([''], 'photo.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * On native (Capacitor), save images directly to the Photos gallery.
 * On mobile web images, open the system share sheet (Save Image → Photos on iOS).
 * Falls back to a direct file download everywhere else or when share is unavailable.
 */
export async function saveBlobToDevice(blob, fileName, { contentType, onToast } = {}) {
  if (!(blob instanceof Blob)) {
    triggerBlobDownload(blob, safeDownloadFileName(fileName))
    return 'download'
  }

  const kind = resolvePreviewKind({ contentType: contentType || blob.type, fileName })
  const isImage = kind === 'image'

  if (isImage && isNativeApp()) {
    const { savePhotoToNativeGallery, SavePhotoNativeError } = await import('./savePhotoNative.js')
    try {
      await savePhotoToNativeGallery(blob, fileName)
      onToast?.('Saved to Photos', 'success')
      return 'native'
    } catch (e) {
      if (e instanceof SavePhotoNativeError && e.code === 'permission_denied') {
        onToast?.('Enable Photos access in Settings to save images', 'error')
        try {
          const { App } = await import('@capacitor/app')
          const { Capacitor } = await import('@capacitor/core')
          if (Capacitor.getPlatform() === 'ios') {
            await App.openUrl({ url: 'app-settings:' })
          } else if (Capacitor.getPlatform() === 'android') {
            await App.openUrl({ url: 'package:com.knockscout.app' })
          }
        } catch {
          // Settings deep link is best-effort
        }
        throw e
      }
      onToast?.(e?.message || 'Could not save to Photos', 'error')
      throw e
    }
  }

  if (isImage && isMobileDevice() && canShareImageFiles()) {
    const mime = blob.type || contentType || 'image/jpeg'
    const name = ensureImageFileName(fileName, mime)
    const file = new File([blob], name, { type: mime })
    try {
      await navigator.share({ files: [file], title: name })
      return 'share'
    } catch (e) {
      if (e?.name === 'AbortError') throw e
    }
  }

  triggerBlobDownload(blob, safeDownloadFileName(fileName))
  return 'download'
}

export { isNativeApp }
