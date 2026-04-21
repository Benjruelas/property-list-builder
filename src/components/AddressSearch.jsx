import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2, Plus, Minus } from 'lucide-react'
import { Button } from './ui/button'
import { useMapboxGeocode } from '@/hooks/useMapboxGeocode'

/**
 * Address search using Mapbox Geocoding API.
 * Geocoding itself lives in `useMapboxGeocode`; this component is the
 * map-side UI (closed/open states, zoom buttons, results dropdown, flyTo).
 */
export function AddressSearch({ onLocationFound, mapInstanceRef, onCloseParcelPopup }) {
  const [isOpen, setIsOpen] = useState(false)
  const { query, setQuery, results, isSearching, error, clear } = useMapboxGeocode()
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        clear()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [isOpen, clear])

  const handleSelectResult = (result) => {
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
    clear()
  }

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false)
      clear()
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
      ref={containerRef}
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
                          result.address.stateLong || result.address.state,
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
