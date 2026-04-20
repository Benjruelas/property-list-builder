import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2, Plus, Minus } from 'lucide-react'
import { Button } from './ui/button'

/**
 * Address search using Mapbox Geocoding API
 * Best-in-class geocoding with autocomplete support
 * Free tier: 100,000 requests/month
 */
export function AddressSearch({ onLocationFound, mapInstanceRef, onCloseParcelPopup }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  // Get Mapbox access token from environment variable
  const getMapboxToken = () => {
    return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
  }

  // Check if input is coordinates
  const isCoordinateQuery = (rawQuery) => {
    const trimmed = rawQuery.trim()
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng }
      }
    }
    return null
  }

  // Perform Mapbox geocoding search
  const performSearch = async (rawQuery) => {
    if (!rawQuery.trim() || rawQuery.length < 2) {
      return
    }

    setIsSearching(true)
    setError(null)
    setResults([])

    try {
      const trimmedQuery = rawQuery.trim()

      // Handle coordinate input directly
      const coordMatch = isCoordinateQuery(trimmedQuery)
      if (coordMatch) {
        const { lat, lng } = coordMatch

        const coordinateResult = {
          id: `coord-${lat}-${lng}`,
          place_name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          center: [lng, lat],
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          _isCoordinate: true,
        }

        setResults([coordinateResult])
        setIsSearching(false)
        return
      }

      // Get Mapbox token
      const accessToken = getMapboxToken()
      if (!accessToken) {
        throw new Error('Mapbox access token not configured. Please set VITE_MAPBOX_ACCESS_TOKEN environment variable.')
      }

      // Build Mapbox Geocoding API URL
      // Use mapbox.places endpoint for address search with proximity bias to DFW area
      // DFW center approximately: 32.7767, -96.7970
      const encodedQuery = encodeURIComponent(trimmedQuery)
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${accessToken}&limit=5&country=us&types=address,poi,place&autocomplete=true`


      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `Mapbox API error: ${response.status}`)
      }

      const data = await response.json()

      if (data && data.features && Array.isArray(data.features)) {
        // Transform Mapbox results to our format
        const transformedResults = data.features.map((feature, index) => {
          const [lng, lat] = feature.center || feature.geometry.coordinates

          const context = feature.context || []
          const city = context.find(c => c.id.startsWith('place'))?.text
          const countyName = context.find(c => c.id.startsWith('district'))?.text || 
                            context.find(c => c.id.startsWith('county'))?.text
          const state = context.find(c => c.id.startsWith('region'))?.text
          const zip = context.find(c => c.id.startsWith('postcode'))?.text

          return {
            id: feature.id || `mapbox-${index}`,
            place_name: feature.place_name || trimmedQuery,
            center: [lng, lat],
            geometry: feature.geometry,
            lat: lat.toString(),
            lon: lng.toString(),
            address: {
              city: city || '',
              county: countyName || '',
              state: state || '',
              zip: zip || ''
            },
            _mapboxFeature: feature
          }
        })

        if (transformedResults.length > 0) {
          setResults(transformedResults)
          setError(null)
        } else {
          console.warn('No results found')
          setResults([])
          setError(`No addresses found for "${trimmedQuery}". Try a different address or coordinates like "32.7767, -96.7970"`)
        }
      } else {
        setResults([])
        setError(`No results found. Try: "123 Main St, Fort Worth, TX" or coordinates like "32.7767, -96.7970"`)
      }
    } catch (err) {
      console.error('Mapbox search error:', err)
      setError(err.message || 'Search failed. Please check your Mapbox configuration and try again.')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim() || query.length < 2) {
      setResults([])
      setError(null)
      return
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query)
    }, 300) // Faster debounce for better UX with Mapbox

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query])

  const handleSelectResult = (result) => {
    // Mapbox format: center is [lng, lat]
    const [lng, lat] = result.center || (result.geometry?.coordinates || [])
    const displayName = result.place_name || query

    const map = mapInstanceRef?.current

    if (map && typeof map.flyTo === 'function') {
      map.flyTo({ center: [lng, lat], zoom: 17, duration: 500 })
      setTimeout(() => {
        if (onLocationFound) {
          onLocationFound({ lat, lng, address: displayName })
        }
      }, 600)
    } else if (onLocationFound && lat && lng) {
      onLocationFound({ lat, lng, address: displayName })
    }

    setIsOpen(false)
    setQuery('')
    setResults([])
  }

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false)
      setQuery('')
      setResults([])
      setError(null)
    } else {
      setIsOpen(true)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }

  // Width of the expanded search pill:
  // - Mobile: fill horizontally, leaving the right-side location button (48px) + the
  //   same gap-2 (8px) spacing we use vertically between buttons.
  //   Total reserved = 12px (left) + 8px (gap) + 48px (right button) + 12px (right) = 80px
  // - Desktop (sm+): capped to just fit the placeholder text (~280px).
  const openPillStyle = {
    width:
      'calc(100vw - 80px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
  }
  const showResultsPanel =
    isOpen && (query.length > 0 || isSearching || error || results.length > 0)

  return (
    <div
      className="map-search-stack absolute z-[1000] flex flex-col items-start gap-2 sm:gap-2 md:gap-2"
      style={{
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: 'calc(12px + env(safe-area-inset-left, 0px))'
      }}
    >
      {!isOpen ? (
        <Button
          onClick={() => {
            onCloseParcelPopup?.()
            handleToggle()
          }}
          size="icon"
          variant="glass-outline"
          className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
          title="Search address"
        >
          <Search className="h-6 w-6 sm:h-5 sm:w-5" />
        </Button>
      ) : (
        <div
          className="relative flex items-center h-12 sm:h-10 rounded-md shadow-lg touch-manipulation sm:!w-[280px] border border-white/60 bg-white/30 text-gray-900 backdrop-blur-sm"
          style={openPillStyle}
        >
          {/* Fixed slot matching zoom button width so the search icon lines up
              exactly with the +/- icons below. */}
          <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 sm:h-10 sm:w-10">
            <Search className="h-6 w-6 sm:h-5 sm:w-5 text-gray-700" />
          </div>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            placeholder="Search address or coordinates..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 h-full bg-transparent outline-none border-none pr-2 text-sm text-gray-900 placeholder:text-gray-600"
          />
          {isSearching && (
            <Loader2 className="mr-1 h-4 w-4 flex-shrink-0 animate-spin text-gray-700" />
          )}
          <button
            type="button"
            onClick={handleToggle}
            className="mr-1 flex-shrink-0 rounded-full p-1.5 text-gray-700 hover:bg-white/40 transition-colors"
            title="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Button
        onClick={() => {
          onCloseParcelPopup?.()
          mapInstanceRef?.current?.zoomIn()
        }}
        size="icon"
        variant="glass-outline"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Zoom in"
      >
        <Plus className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      <Button
        onClick={() => {
          onCloseParcelPopup?.()
          mapInstanceRef?.current?.zoomOut()
        }}
        size="icon"
        variant="glass-outline"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Zoom out"
      >
        <Minus className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>

      {showResultsPanel && (
        <div
          className="map-panel absolute top-[calc(48px+8px)] sm:top-[calc(40px+8px)] left-0 rounded-xl overflow-hidden z-50 sm:!w-[280px]"
          style={openPillStyle}
        >
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto parcel-details-scroll">
            {results.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {results.map((result) => (
                  <li
                    key={result.id || result._mapboxFeature?.id}
                    onClick={() => handleSelectResult(result)}
                    className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {result.place_name}
                    </div>
                    {result.address && (
                      <div className="text-xs text-gray-500 mt-1">
                        {[
                          result.address.city,
                          result.address.county,
                          result.address.state,
                          result.address.zip
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : query.length >= 2 && !isSearching && !error ? (
              <div className="p-3 text-sm text-gray-600 text-center">
                <div>No results found for "{query}"</div>
                <div className="text-xs mt-2 text-gray-500">
                  Try: street address, city name, zip code, or coordinates (lat, lng)
                </div>
              </div>
            ) : query.length > 0 && query.length < 2 ? (
              <div className="p-3 text-sm text-gray-600 text-center">
                Type at least 2 characters to search
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
