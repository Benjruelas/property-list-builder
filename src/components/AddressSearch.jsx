import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2, Plus, CheckSquare, Square, Route } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useMapboxGeocode } from '@/hooks/useMapboxGeocode'
import {
  MAP_CHROME_BTN,
  MAP_CHROME_BTN_OFFSET_LEFT,
  MAP_CHROME_STACK_LEFT,
} from '@/lib/mapChrome'

/**
 * Address search using Mapbox Geocoding API.
 * Geocoding itself lives in `useMapboxGeocode`; this component is the
 * left map chrome (search, multi-select, path recording, results dropdown, flyTo).
 */
export function AddressSearch({
  onLocationFound,
  mapInstanceRef,
  onCloseParcelPopup,
  onToggleMultiSelect,
  isMultiSelectActive,
  multiSelectParcelCount = 0,
  onCancelMultiSelect,
  onOpenListPanel,
  onTogglePathTracking,
  isPathTrackingActive,
  currentUser,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { query, setQuery, results, isSearching, error, clear } = useMapboxGeocode()
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const multiSelectAddToListMode = isMultiSelectActive && multiSelectParcelCount > 0

  const runAction = (fn) => (...args) => {
    onCloseParcelPopup?.()
    return fn?.(...args)
  }

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

  const openPillStyle = {
    width:
      'calc(100vw - 12px - var(--map-chrome-btn-gap) - var(--map-chrome-btn-size) - 12px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
  }
  const showResultsPanel =
    isOpen && (query.length > 0 || isSearching || error || results.length > 0)

  return (
    <div
      ref={containerRef}
      className={MAP_CHROME_STACK_LEFT}
    >
      {!isOpen ? (
        <Button
          onClick={() => {
            onCloseParcelPopup?.()
            handleToggle()
          }}
          size="icon"
          variant="glass-outline"
          className={MAP_CHROME_BTN}
          title="Search address"
        >
          <Search />
        </Button>
      ) : (
        <div
          className="map-search-open-pill relative flex items-center rounded-md shadow-lg touch-manipulation md:!w-[280px] border border-white/60 bg-white/30 text-gray-900 backdrop-blur-sm"
          style={openPillStyle}
        >
          <div className="map-chrome-icon-slot flex-shrink-0">
            <Search className="text-gray-700" />
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
            className="map-chrome-icon-slot map-search-pill-close flex-shrink-0"
            title="Close search"
            aria-label="Close search"
          >
            <X className="text-gray-700" />
          </button>
        </div>
      )}

      <div className="map-chrome-slot relative flex shrink-0 items-center justify-center">
        {multiSelectAddToListMode && (
          <Button
            type="button"
            size="icon"
            variant="glass"
            onClick={runAction(() => onCancelMultiSelect?.())}
            className={cn(
              MAP_CHROME_BTN,
              'absolute left-full top-1/2 z-10 -translate-y-1/2 bg-red-600/90 hover:bg-red-700/95 border-red-400/60 text-white',
              MAP_CHROME_BTN_OFFSET_LEFT
            )}
            title="Cancel multi-select and clear selection"
          >
            <X strokeWidth={2.5} />
          </Button>
        )}
        {multiSelectAddToListMode ? (
          <Button
            data-tour="multi-select"
            onClick={runAction(() => onOpenListPanel())}
            size="icon"
            variant="glass"
            className={cn(
              MAP_CHROME_BTN,
              'shrink-0 bg-blue-600/90 hover:bg-blue-700/95 border-blue-400/60 text-white'
            )}
            title={`Add ${multiSelectParcelCount} selected parcel${multiSelectParcelCount === 1 ? "" : "s"} to a list`}
          >
            <Plus strokeWidth={2.5} />
          </Button>
        ) : (
          <Button
            data-tour="multi-select"
            onClick={runAction(onToggleMultiSelect)}
            size="icon"
            variant={isMultiSelectActive ? "glass" : "glass-outline"}
            className={cn(
              MAP_CHROME_BTN,
              'shrink-0',
              isMultiSelectActive && "bg-green-600/80 hover:bg-green-700/90 border-green-400/50 text-white",
              !currentUser && "opacity-50 cursor-not-allowed"
            )}
            disabled={!currentUser}
            title={
              !currentUser
                ? "Sign in to use multi-select"
                : isMultiSelectActive
                  ? "Multi-select ON - Click to turn off"
                  : "Multi-select OFF - Click to turn on"
            }
          >
            {isMultiSelectActive ? <CheckSquare /> : <Square />}
          </Button>
        )}
      </div>

      <Button
        data-tour="path-recording"
        onClick={runAction(onTogglePathTracking)}
        size="icon"
        variant={isPathTrackingActive ? "glass" : "glass-outline"}
        className={cn(
          MAP_CHROME_BTN,
          isPathTrackingActive &&
            "path-tracking-active bg-red-600/80 hover:bg-red-700/90 border-red-400/50 text-white",
          !currentUser && "opacity-50 cursor-not-allowed"
        )}
        disabled={!currentUser}
        title={!currentUser
          ? "Sign in to record paths"
          : isPathTrackingActive
            ? "Recording path - tap to stop & save"
            : "Start recording path"}
      >
        <Route />
      </Button>

      {showResultsPanel && (
        <div
          className="map-search-results-panel map-panel absolute left-0 rounded-xl overflow-hidden z-50 md:!w-[280px]"
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
