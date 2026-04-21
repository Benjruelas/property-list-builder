import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Headless Mapbox geocoding hook. Handles debounce, coordinate shortcut,
 * loading state, errors, and normalizes results into a small shape.
 *
 * Returns:
 *   { query, setQuery, results, isSearching, error, clear }
 *
 * Each result:
 *   {
 *     id, place_name,
 *     center: [lng, lat],
 *     geometry, lat, lon,
 *     address: { city, county, state, zip, line1 }
 *   }
 */

const getMapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

function parseCoordinateQuery(raw) {
  const trimmed = (raw || '').trim()
  const m = trimmed.match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null
  return { lat, lng }
}

function transformFeature(feature, index, fallbackQuery) {
  const [lng, lat] = feature.center || feature.geometry?.coordinates || []
  const context = feature.context || []
  const city = context.find((c) => c.id?.startsWith('place'))?.text
  const countyName =
    context.find((c) => c.id?.startsWith('district'))?.text ||
    context.find((c) => c.id?.startsWith('county'))?.text
  const state = context.find((c) => c.id?.startsWith('region'))?.text
  const shortState = context.find((c) => c.id?.startsWith('region'))?.short_code
  const zip = context.find((c) => c.id?.startsWith('postcode'))?.text

  // Street-only line for form autocomplete: drop the trailing ", city, state zip"
  const placeName = feature.place_name || fallbackQuery || ''
  const firstComma = placeName.indexOf(',')
  const line1 = firstComma > 0 ? placeName.slice(0, firstComma).trim() : placeName.trim()

  return {
    id: feature.id || `mapbox-${index}`,
    place_name: placeName,
    center: [lng, lat],
    geometry: feature.geometry,
    lat: lat != null ? lat.toString() : '',
    lon: lng != null ? lng.toString() : '',
    address: {
      line1,
      city: city || '',
      county: countyName || '',
      state: (shortState || state || '').replace(/^us-/i, '').toUpperCase(),
      stateLong: state || '',
      zip: zip || ''
    },
    _mapboxFeature: feature
  }
}

export function useMapboxGeocode({
  debounceMs = 300,
  types = 'address,poi,place',
  country = 'us',
  limit = 5,
  proximity = null
} = {}) {
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const timeoutRef = useRef(null)
  const abortRef = useRef(null)

  // Serialize proximity to a stable string so the effect only re-fires when
  // the coordinates actually change.
  const proximityParam =
    proximity && Number.isFinite(proximity.lat) && Number.isFinite(proximity.lng)
      ? `${proximity.lng},${proximity.lat}`
      : ''

  const clear = useCallback(() => {
    setQueryState('')
    setResults([])
    setError(null)
    setIsSearching(false)
  }, [])

  const setQuery = useCallback((v) => setQueryState(v ?? ''), [])

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (!query.trim() || query.trim().length < 2) {
      setResults([])
      setError(null)
      setIsSearching(false)
      return
    }

    timeoutRef.current = setTimeout(async () => {
      const trimmed = query.trim()

      // Coordinate shortcut
      const coord = parseCoordinateQuery(trimmed)
      if (coord) {
        const { lat, lng } = coord
        setResults([
          {
            id: `coord-${lat}-${lng}`,
            place_name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            center: [lng, lat],
            geometry: { type: 'Point', coordinates: [lng, lat] },
            lat: lat.toString(),
            lon: lng.toString(),
            address: { line1: '', city: '', county: '', state: '', stateLong: '', zip: '' },
            _isCoordinate: true
          }
        ])
        setError(null)
        setIsSearching(false)
        return
      }

      const accessToken = getMapboxToken()
      if (!accessToken) {
        setError('Mapbox access token not configured.')
        setResults([])
        return
      }

      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      setIsSearching(true)
      setError(null)
      setResults([])

      try {
        const encoded = encodeURIComponent(trimmed)
        const proximityPart = proximityParam ? `&proximity=${encodeURIComponent(proximityParam)}` : ''
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${accessToken}&limit=${limit}&country=${country}&types=${types}&autocomplete=true${proximityPart}`
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message || `Mapbox error: ${res.status}`)
        }
        const data = await res.json()
        const features = Array.isArray(data?.features) ? data.features : []
        const transformed = features.map((f, i) => transformFeature(f, i, trimmed))
        setResults(transformed)
        if (transformed.length === 0) {
          setError(`No results for "${trimmed}".`)
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('Mapbox geocode error:', err)
        setError(err.message || 'Search failed.')
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [query, debounceMs, types, country, limit, proximityParam])

  return { query, setQuery, results, isSearching, error, clear }
}
