import { useState, useEffect, useCallback, useRef } from 'react'
import { deferRevokeObjectURL, isRevocableBlobUrl, blobToDataUrl } from '@/utils/blobUrl'
import {
  getPhotoThumbnailFetchKeys,
  getPhotoThumbSourceToken,
  getAnnotatedDataPreviewUrl,
  shouldUseLocalPhotoPreview,
} from '@/utils/photoDisplay'

// A single thumbnail fetch must never hang forever — if it stalls it would hold
// the in-flight slot and block every retry, leaving the photo spinning.
const THUMB_FETCH_TIMEOUT_MS = 15000
// Bounded retry so transient network errors / 404s (e.g. a just-uploaded thumb
// that R2 hasn't propagated yet) recover without waiting for the next poll.
const THUMB_MAX_FETCH_ATTEMPTS = 6

/**
 * Loads and caches gallery thumbnail blob URLs for a list of photos.
 *
 * Resilient against the failure modes that previously caused random endless
 * spinners: request churn from re-renders, stalled fetches holding an in-flight
 * slot, and transient fetch failures with no retry.
 *
 * @param {object} options
 * @param {object[]} options.photos - photos to display thumbnails for
 * @param {() => Promise<string|null>} options.getToken
 * @param {(key: string, version: string) => string} options.buildUrl - leadPhotoUrl/dealPhotoUrl
 * @param {string|undefined} options.resetKey - entity id; resets cache when it changes
 */
export function usePhotoThumbnailLoader({ photos, getToken, buildUrl, resetKey }) {
  const [thumbUrls, setThumbUrls] = useState({})
  const thumbLoadedRef = useRef({})
  const thumbRequestRef = useRef({})
  const thumbInflightRef = useRef({})
  const pendingAnnotatedPreviewRef = useRef({})
  const thumbUrlsRef = useRef({})
  const thumbErrorRetryRef = useRef({})
  const thumbFetchAttemptsRef = useRef({})
  const thumbRetryTimerRef = useRef({})
  const loadThumbRef = useRef(null)

  const clearRetryTimer = useCallback((photoId) => {
    const timer = thumbRetryTimerRef.current[photoId]
    if (timer) {
      clearTimeout(timer)
      delete thumbRetryTimerRef.current[photoId]
    }
  }, [])

  const loadThumb = useCallback(async (photo, { skipLocalPreview = false } = {}) => {
    if (!photo?.id) return
    const pendingPreview = skipLocalPreview ? null : pendingAnnotatedPreviewRef.current[photo.id]
    const rawPreview = skipLocalPreview
      ? null
      : (photo._annotatedPreviewUrl || pendingPreview || null)
    if (isRevocableBlobUrl(rawPreview)) {
      delete pendingAnnotatedPreviewRef.current[photo.id]
    }
    const annotatedPreviewUrl = getAnnotatedDataPreviewUrl(photo, pendingPreview, { skipLocalPreview })
    if (annotatedPreviewUrl) {
      setThumbUrls((prev) => (prev[photo.id] === annotatedPreviewUrl ? prev : { ...prev, [photo.id]: annotatedPreviewUrl }))
      return
    }
    if (!skipLocalPreview && shouldUseLocalPhotoPreview(photo)) {
      const localUrl = photo._localPreviewUrl
      setThumbUrls((prev) => (prev[photo.id] === localUrl ? prev : { ...prev, [photo.id]: localUrl }))
      return
    }
    // Show the just-uploaded thumbnail immediately, then continue to fetch the
    // canonical server thumb (fresh preview is client-only and vanishes on poll).
    if (!skipLocalPreview && photo._freshThumbUrl) {
      const freshUrl = photo._freshThumbUrl
      setThumbUrls((prev) => (prev[photo.id] === freshUrl ? prev : { ...prev, [photo.id]: freshUrl }))
    }
    const keys = getPhotoThumbnailFetchKeys(photo).filter((key) => key && key !== '__pending__')
    if (!keys.length) return
    const sourceToken = getPhotoThumbSourceToken(photo)
    if (
      thumbLoadedRef.current[photo.id] === sourceToken
      && thumbUrlsRef.current[photo.id]
      && !annotatedPreviewUrl
    ) return
    // A fetch for this exact photo version is already running. Skip starting a
    // duplicate (re-running on every poll would otherwise pile up requests).
    if (thumbInflightRef.current[photo.id]?.token === sourceToken) return

    clearRetryTimer(photo.id)
    const requestId = (thumbRequestRef.current[photo.id] || 0) + 1
    thumbRequestRef.current[photo.id] = requestId
    thumbInflightRef.current[photo.id] = { token: sourceToken, reqId: requestId }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), THUMB_FETCH_TIMEOUT_MS)
    let blob = null
    let superseded = false
    try {
      const token = await getToken()
      if (token) {
        for (const key of keys) {
          const res = await fetch(buildUrl(key, sourceToken), {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: controller.signal,
          })
          if (thumbRequestRef.current[photo.id] !== requestId) {
            superseded = true
            break
          }
          if (res.ok) {
            blob = await res.blob()
            break
          }
        }
      }
    } catch {
      // network error / timeout / abort — handled by retry below
    } finally {
      clearTimeout(timeoutId)
      // Only the request that currently owns the in-flight slot clears it.
      if (thumbInflightRef.current[photo.id]?.reqId === requestId) {
        delete thumbInflightRef.current[photo.id]
      }
    }

    if (superseded || thumbRequestRef.current[photo.id] !== requestId) return

    if (blob) {
      thumbLoadedRef.current[photo.id] = sourceToken
      thumbErrorRetryRef.current[photo.id] = 0
      thumbFetchAttemptsRef.current[photo.id] = 0
      // Store as data: URL so revoked blob: handles never break <img src>.
      let url
      try {
        url = await blobToDataUrl(blob)
      } catch {
        url = URL.createObjectURL(blob)
      }
      const pendingDataPreview = pendingAnnotatedPreviewRef.current[photo.id]
      if (pendingDataPreview) delete pendingAnnotatedPreviewRef.current[photo.id]
      setThumbUrls((prev) => {
        const previous = prev[photo.id]
        if (previous?.startsWith('blob:') && previous !== url) deferRevokeObjectURL(previous)
        if (pendingDataPreview && isRevocableBlobUrl(pendingDataPreview) && pendingDataPreview !== url && pendingDataPreview !== previous) {
          deferRevokeObjectURL(pendingDataPreview)
        }
        return { ...prev, [photo.id]: url }
      })
      return
    }

    // No blob: network error, timeout, or every key 404'd. Retry with backoff so
    // a transient failure or upload-propagation delay recovers on its own.
    if (thumbUrlsRef.current[photo.id]) return
    const attempts = (thumbFetchAttemptsRef.current[photo.id] || 0) + 1
    thumbFetchAttemptsRef.current[photo.id] = attempts
    if (attempts > THUMB_MAX_FETCH_ATTEMPTS) return
    const delay = Math.min(1500 * 2 ** (attempts - 1), 15000)
    clearRetryTimer(photo.id)
    thumbRetryTimerRef.current[photo.id] = setTimeout(() => {
      delete thumbRetryTimerRef.current[photo.id]
      loadThumbRef.current?.(photo, { skipLocalPreview })
    }, delay)
  }, [getToken, buildUrl, clearRetryTimer])

  loadThumbRef.current = loadThumb

  const handleThumbLoadError = useCallback((photo) => {
    if (!photo?.id) return
    const retries = (thumbErrorRetryRef.current[photo.id] || 0) + 1
    if (retries > 5) return
    thumbErrorRetryRef.current[photo.id] = retries
    delete thumbLoadedRef.current[photo.id]
    delete thumbInflightRef.current[photo.id]
    delete pendingAnnotatedPreviewRef.current[photo.id]
    thumbRequestRef.current[photo.id] = (thumbRequestRef.current[photo.id] || 0) + 1
    setThumbUrls((prev) => {
      const bad = prev[photo.id]
      if (bad?.startsWith('blob:')) deferRevokeObjectURL(bad)
      const next = { ...prev }
      delete next[photo.id]
      return next
    })
    loadThumb({ ...photo, _annotatedPreviewUrl: undefined }, { skipLocalPreview: true })
  }, [loadThumb])

  const invalidatePhotoThumb = useCallback((photoId) => {
    if (!photoId) return
    thumbRequestRef.current[photoId] = (thumbRequestRef.current[photoId] || 0) + 1
    delete thumbLoadedRef.current[photoId]
    delete thumbInflightRef.current[photoId]
    thumbFetchAttemptsRef.current[photoId] = 0
    clearRetryTimer(photoId)
    const pendingPreview = pendingAnnotatedPreviewRef.current[photoId]
    if (pendingPreview) delete pendingAnnotatedPreviewRef.current[photoId]
    setThumbUrls((prev) => {
      const previous = prev[photoId]
      if (previous?.startsWith('blob:')) deferRevokeObjectURL(previous)
      if (pendingPreview && isRevocableBlobUrl(pendingPreview) && pendingPreview !== previous) {
        deferRevokeObjectURL(pendingPreview)
      }
      const next = { ...prev }
      delete next[photoId]
      return next
    })
  }, [clearRetryTimer])

  // Force a fresh server fetch for a photo (e.g. after an annotation save).
  const reloadThumb = useCallback((photo) => {
    if (!photo?.id) return
    thumbRequestRef.current[photo.id] = (thumbRequestRef.current[photo.id] || 0) + 1
    delete thumbLoadedRef.current[photo.id]
    delete thumbInflightRef.current[photo.id]
    delete pendingAnnotatedPreviewRef.current[photo.id]
    thumbFetchAttemptsRef.current[photo.id] = 0
    clearRetryTimer(photo.id)
    const { _annotatedPreviewUrl, _annotationSaving, ...serverPhoto } = photo
    loadThumbRef.current?.(serverPhoto, { skipLocalPreview: true })
  }, [clearRetryTimer])

  const setPendingAnnotatedPreview = useCallback((photoId, url) => {
    if (photoId && url) pendingAnnotatedPreviewRef.current[photoId] = url
  }, [])

  // Reset all caches/timers when switching to a different entity.
  useEffect(() => {
    setThumbUrls({})
    thumbLoadedRef.current = {}
    thumbRequestRef.current = {}
    thumbInflightRef.current = {}
    pendingAnnotatedPreviewRef.current = {}
    thumbErrorRetryRef.current = {}
    thumbFetchAttemptsRef.current = {}
    Object.values(thumbRetryTimerRef.current).forEach((timer) => clearTimeout(timer))
    thumbRetryTimerRef.current = {}
  }, [resetKey])

  useEffect(() => {
    photos.forEach((p) => loadThumb(p))
  }, [photos, loadThumb])

  // Mirror latest thumbUrls for the in-flight guard and unmount cleanup without
  // re-running effects when they change.
  thumbUrlsRef.current = thumbUrls

  useEffect(() => () => {
    Object.entries(thumbUrlsRef.current).forEach(([, url]) => {
      if (url?.startsWith('blob:')) deferRevokeObjectURL(url)
    })
    Object.values(pendingAnnotatedPreviewRef.current).forEach((url) => {
      if (url?.startsWith('blob:')) deferRevokeObjectURL(url)
    })
    Object.values(thumbRetryTimerRef.current).forEach((timer) => clearTimeout(timer))
  }, [])

  return {
    thumbUrls,
    loadThumb,
    reloadThumb,
    invalidatePhotoThumb,
    handleThumbLoadError,
    setPendingAnnotatedPreview,
  }
}

export default usePhotoThumbnailLoader
