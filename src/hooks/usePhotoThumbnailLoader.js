import { useState, useEffect, useCallback, useRef } from 'react'
import { deferRevokeObjectURL, isRevocableBlobUrl, blobToDataUrl } from '@/utils/blobUrl'
import {
  getPhotoThumbnailFetchKeys,
  getPhotoThumbSourceToken,
  getAnnotatedDataPreviewUrl,
  shouldUseLocalPhotoPreview,
} from '@/utils/photoDisplay'

const THUMB_FETCH_TIMEOUT_MS = 15000
const THUMB_MAX_FETCH_ATTEMPTS = 6
const THUMB_SLOW_RETRY_MS = 30000

function setThumbUrlForPhoto(setThumbUrls, thumbUrlsRef, photoId, url) {
  thumbUrlsRef.current = { ...thumbUrlsRef.current, [photoId]: url }
  setThumbUrls((prev) => (prev[photoId] === url ? prev : { ...prev, [photoId]: url }))
}

/**
 * Loads and caches gallery thumbnail blob URLs for a list of photos.
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
  const thumbSourceTokenRef = useRef({})
  const thumbRetryTimerRef = useRef({})
  const loadThumbRef = useRef(null)
  const photosRef = useRef(photos)

  const clearRetryTimer = useCallback((photoId) => {
    const timer = thumbRetryTimerRef.current[photoId]
    if (timer) {
      clearTimeout(timer)
      delete thumbRetryTimerRef.current[photoId]
    }
  }, [])

  const scheduleThumbRetry = useCallback((photo, { skipLocalPreview = false } = {}) => {
    if (!photo?.id) return
    if (thumbUrlsRef.current[photo.id]) return

    const attempts = (thumbFetchAttemptsRef.current[photo.id] || 0) + 1
    thumbFetchAttemptsRef.current[photo.id] = attempts

    const delay = attempts > THUMB_MAX_FETCH_ATTEMPTS
      ? THUMB_SLOW_RETRY_MS
      : Math.min(1500 * 2 ** (attempts - 1), 15000)

    clearRetryTimer(photo.id)
    thumbRetryTimerRef.current[photo.id] = setTimeout(() => {
      delete thumbRetryTimerRef.current[photo.id]
      loadThumbRef.current?.(photo, { skipLocalPreview })
    }, delay)
  }, [clearRetryTimer])

  const resetFetchAttemptsForPhoto = useCallback((photoId) => {
    if (!photoId) return
    thumbFetchAttemptsRef.current[photoId] = 0
    delete thumbLoadedRef.current[photoId]
    clearRetryTimer(photoId)
  }, [clearRetryTimer])

  const retryStuckThumbnails = useCallback(() => {
    for (const p of photosRef.current || []) {
      if (!p?.id || thumbUrlsRef.current[p.id]) continue
      const keys = getPhotoThumbnailFetchKeys(p).filter((key) => key && key !== '__pending__')
      if (!keys.length) continue
      resetFetchAttemptsForPhoto(p.id)
      loadThumbRef.current?.(p)
    }
  }, [resetFetchAttemptsForPhoto])

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
      setThumbUrlForPhoto(setThumbUrls, thumbUrlsRef, photo.id, annotatedPreviewUrl)
      return
    }
    if (!skipLocalPreview && shouldUseLocalPhotoPreview(photo)) {
      setThumbUrlForPhoto(setThumbUrls, thumbUrlsRef, photo.id, photo._localPreviewUrl)
      return
    }
    if (!skipLocalPreview && photo._freshThumbUrl) {
      setThumbUrlForPhoto(setThumbUrls, thumbUrlsRef, photo.id, photo._freshThumbUrl)
      return
    }

    const keys = getPhotoThumbnailFetchKeys(photo).filter((key) => key && key !== '__pending__')
    if (!keys.length) return
    const sourceToken = getPhotoThumbSourceToken(photo)
    const prevSourceToken = thumbSourceTokenRef.current[photo.id]
    if (prevSourceToken !== undefined && prevSourceToken !== sourceToken) {
      resetFetchAttemptsForPhoto(photo.id)
    }
    thumbSourceTokenRef.current[photo.id] = sourceToken

    if (
      thumbLoadedRef.current[photo.id] === sourceToken
      && thumbUrlsRef.current[photo.id]
      && !annotatedPreviewUrl
    ) return
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
      if (thumbInflightRef.current[photo.id]?.reqId === requestId) {
        delete thumbInflightRef.current[photo.id]
      }
    }

    if (superseded || thumbRequestRef.current[photo.id] !== requestId) return

    if (blob) {
      thumbLoadedRef.current[photo.id] = sourceToken
      thumbErrorRetryRef.current[photo.id] = 0
      thumbFetchAttemptsRef.current[photo.id] = 0
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
        const next = { ...prev, [photo.id]: url }
        thumbUrlsRef.current = next
        return next
      })
      return
    }

    if (thumbUrlsRef.current[photo.id]) return
    scheduleThumbRetry(photo, { skipLocalPreview })
  }, [getToken, buildUrl, clearRetryTimer, resetFetchAttemptsForPhoto, scheduleThumbRetry])

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
      thumbUrlsRef.current = next
      return next
    })
    loadThumb({ ...photo, _annotatedPreviewUrl: undefined })
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
      thumbUrlsRef.current = next
      return next
    })
  }, [clearRetryTimer])

  const reloadThumb = useCallback((photo) => {
    if (!photo?.id) return
    thumbRequestRef.current[photo.id] = (thumbRequestRef.current[photo.id] || 0) + 1
    delete thumbLoadedRef.current[photo.id]
    delete thumbInflightRef.current[photo.id]
    delete pendingAnnotatedPreviewRef.current[photo.id]
    thumbFetchAttemptsRef.current[photo.id] = 0
    clearRetryTimer(photo.id)
    const { _annotatedPreviewUrl, _annotationSaving, ...serverPhoto } = photo
    loadThumbRef.current?.(serverPhoto)
  }, [clearRetryTimer])

  const setPendingAnnotatedPreview = useCallback((photoId, url) => {
    if (photoId && url) pendingAnnotatedPreviewRef.current[photoId] = url
  }, [])

  useEffect(() => {
    setThumbUrls({})
    thumbUrlsRef.current = {}
    thumbLoadedRef.current = {}
    thumbRequestRef.current = {}
    thumbInflightRef.current = {}
    pendingAnnotatedPreviewRef.current = {}
    thumbErrorRetryRef.current = {}
    thumbFetchAttemptsRef.current = {}
    thumbSourceTokenRef.current = {}
    Object.values(thumbRetryTimerRef.current).forEach((timer) => clearTimeout(timer))
    thumbRetryTimerRef.current = {}
  }, [resetKey])

  photosRef.current = photos

  useEffect(() => {
    photos.forEach((p) => loadThumb(p))
  }, [photos, loadThumb])

  useEffect(() => {
    const onOnline = () => retryStuckThumbnails()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retryStuckThumbnails()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [retryStuckThumbnails])

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
