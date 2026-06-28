import { useState, useEffect, useRef, useCallback } from 'react'
import { buildMapStyle } from '../config/buildMapStyle'
import { getMapboxFallbackSource, normalizeGoogleSource } from '../config/mapProviders'

const SESSION_REFRESH_BUFFER_MS = 120_000
const BASEMAP_SESSION_STORAGE_KEY = 'knockscout_basemap_sessions'

function readPersistedSession(mapStyleSetting) {
  try {
    const raw = sessionStorage.getItem(BASEMAP_SESSION_STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw)
    const entry = all[mapStyleSetting]
    if (!entry?.expiry || entry.useClientFallback) return null
    if (Date.now() > entry.expiry - SESSION_REFRESH_BUFFER_MS) return null
    return entry
  } catch {
    return null
  }
}

function persistSession(mapStyleSetting, data) {
  try {
    const raw = sessionStorage.getItem(BASEMAP_SESSION_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[mapStyleSetting] = data
    sessionStorage.setItem(BASEMAP_SESSION_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore quota / private mode */
  }
}

function readyStateFromSession(mapStyleSetting, sessionData) {
  return {
    mapStyle: buildMapStyle(normalizeGoogleSource(sessionData), mapStyleSetting),
    basemapStatus: 'ready',
    basemapProvider: 'google',
  }
}

/**
 * Loads Google Map Tiles session (primary) or Mapbox raster (fallback) for the active map style.
 * Reuses a valid session from sessionStorage so repeat visits skip the API round-trip.
 * @param {'satellite' | 'street' | 'hybrid'} mapStyleSetting
 * @param {{ onTileUrlRefresh?: (tileUrl: string) => void }} [options]
 */
export function useBasemapStyle(mapStyleSetting, options = {}) {
  const onTileUrlRefreshRef = useRef(options.onTileUrlRefresh)
  onTileUrlRefreshRef.current = options.onTileUrlRefresh

  const [state, setState] = useState(() => {
    const cached = readPersistedSession(mapStyleSetting)
    if (!cached) {
      return { mapStyle: null, basemapStatus: 'loading', basemapProvider: null }
    }
    return readyStateFromSession(mapStyleSetting, cached)
  })

  const sessionCacheRef = useRef({})
  const loadIdRef = useRef(0)

  const applyBasemapSource = useCallback((basemapSource, provider) => {
    setState({
      mapStyle: buildMapStyle(basemapSource, mapStyleSetting),
      basemapStatus: 'ready',
      basemapProvider: provider,
    })
  }, [mapStyleSetting])

  const applyMapboxFallback = useCallback((background) => {
    const fallback = getMapboxFallbackSource(mapStyleSetting)
    if (!fallback) return false
    if (!background) {
      applyBasemapSource(fallback, 'mapbox')
    }
    return true
  }, [mapStyleSetting, applyBasemapSource])

  const loadBasemap = useCallback(async ({ background = false } = {}) => {
    const loadId = ++loadIdRef.current

    if (!background) {
      setState((prev) => (prev.basemapStatus === 'ready' ? prev : { ...prev, basemapStatus: 'loading' }))
    }

    try {
      const res = await fetch(`/api/google-tiles-session?mapType=${encodeURIComponent(mapStyleSetting)}`)
      if (res.ok) {
        const data = await res.json()
        if (loadId !== loadIdRef.current) return

        if (data.useClientFallback) {
          if (background) return
          if (!applyMapboxFallback(false)) {
            setState({ mapStyle: null, basemapStatus: 'error', basemapProvider: null })
          }
          return
        }

        sessionCacheRef.current[mapStyleSetting] = data
        persistSession(mapStyleSetting, data)

        if (background) {
          onTileUrlRefreshRef.current?.(normalizeGoogleSource(data).tileUrl)
          return
        }

        applyBasemapSource(normalizeGoogleSource(data), 'google')
        return
      }
    } catch {
      /* fall through to Mapbox */
    }

    if (loadId !== loadIdRef.current) return

    if (!applyMapboxFallback(background)) {
      if (!background) {
        setState({
          mapStyle: null,
          basemapStatus: 'error',
          basemapProvider: null,
        })
      }
    }
  }, [mapStyleSetting, applyBasemapSource, applyMapboxFallback])

  useEffect(() => {
    const persisted = readPersistedSession(mapStyleSetting)
    if (persisted) {
      sessionCacheRef.current[mapStyleSetting] = persisted
      setState(readyStateFromSession(mapStyleSetting, persisted))
      loadBasemap({ background: true })
      return
    }
    loadBasemap({ background: false })
  }, [mapStyleSetting, loadBasemap])

  useEffect(() => {
    const cached = sessionCacheRef.current[mapStyleSetting]
    if (!cached?.expiry || state.basemapProvider !== 'google' || state.basemapStatus !== 'ready') return undefined

    const refreshIn = cached.expiry - Date.now() - SESSION_REFRESH_BUFFER_MS
    if (refreshIn <= 0) {
      loadBasemap({ background: true })
      return undefined
    }

    const timer = window.setTimeout(() => loadBasemap({ background: true }), refreshIn)
    return () => window.clearTimeout(timer)
  }, [mapStyleSetting, state.basemapProvider, state.basemapStatus, loadBasemap])

  return {
    mapStyle: state.mapStyle,
    basemapStatus: state.basemapStatus,
    basemapProvider: state.basemapProvider,
    retryBasemap: () => loadBasemap({ background: false }),
  }
}
