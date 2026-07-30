import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Search,
  X,
  Loader2,
  Plus,
  CheckSquare,
  Square,
  Route,
  User,
  Briefcase,
  ListTodo,
  FileText,
  Camera,
  MapPin,
} from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useMapboxGeocode } from '@/hooks/useMapboxGeocode'
import { useMapEntitySearch } from '@/hooks/useMapEntitySearch'
import { isAddressLikeQuery } from '@/utils/mapEntitySearch'
import {
  MAP_CHROME_BTN,
  MAP_CHROME_BTN_OFFSET_LEFT,
  MAP_CHROME_STACK_LEFT,
} from '@/lib/mapChrome'

const KIND_ICON = {
  address: MapPin,
  lead: User,
  deal: Briefcase,
  task: ListTodo,
  quote: FileText,
  report: Camera,
}

/**
 * Dual-purpose map search: CRM leads (+ linked deals/tasks/quotes/reports)
 * with Mapbox address suggestions when the query looks like a street address.
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
  leads = [],
  pipelines = [],
  getToken,
  onOpenLead,
  onOpenDeal,
  onOpenTask,
  onOpenQuote,
  onOpenReport,
  /** Notifies parent when search opens/closes so other map chrome can fade. */
  onOpenChange,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const {
    query,
    setQuery,
    results: geocodeResults,
    isSearching: geocodeSearching,
    error: geocodeError,
    clear: clearGeocode,
  } = useMapboxGeocode()
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const multiSelectAddToListMode = isMultiSelectActive && multiSelectParcelCount > 0

  const addressLikeLive = useMemo(() => isAddressLikeQuery(query), [query])

  const { rows, leadMatches, addressResults, addressLike, isSearching, debouncedQuery } =
    useMapEntitySearch({
      query,
      leads,
      pipelines,
      getToken,
      currentUser,
      geocodeResults,
      geocodeSearching,
      enabled: isOpen,
    })

  const closeSearch = () => {
    setIsOpen(false)
    clearGeocode()
  }

  const runAction = (fn) => (...args) => {
    onCloseParcelPopup?.()
    return fn?.(...args)
  }

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        clearGeocode()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [isOpen, clearGeocode])

  const handleSelectAddress = (result) => {
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

    closeSearch()
  }

  const closeAfterSelect = () => {
    closeSearch()
  }

  const handleSelectRow = (row) => {
    onCloseParcelPopup?.()
    switch (row.kind) {
      case 'address':
        handleSelectAddress(row.result)
        return
      case 'lead':
        onOpenLead?.(row.match.lead)
        closeAfterSelect()
        return
      case 'deal':
        onOpenDeal?.(row.entity)
        closeAfterSelect()
        return
      case 'task':
        onOpenTask?.(row.entity)
        closeAfterSelect()
        return
      case 'quote':
        onOpenQuote?.(row.entity)
        closeAfterSelect()
        return
      case 'report':
        onOpenReport?.(row.entity)
        closeAfterSelect()
        return
      default:
        break
    }
  }

  const handleToggle = () => {
    if (isOpen) {
      closeSearch()
    } else {
      setIsOpen(true)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }

  // Stretch from left chrome inset to the right edge of the right-side map buttons.
  const openPillStyle = {
    width: 'calc(100vw - var(--map-chrome-left) - var(--map-chrome-right))',
  }

  const trimmed = query.trim()
  const showGeocodeError =
    addressLike && !!geocodeError && leadMatches.length === 0 && addressResults.length === 0
  const showEmptyHint =
    trimmed.length >= 2 &&
    !isSearching &&
    !showGeocodeError &&
    rows.length === 0 &&
    addressLike
  // Name-like queries with no CRM hits: hide the panel entirely ("show nothing").
  const showResultsPanel =
    isOpen &&
    (rows.length > 0 ||
      isSearching ||
      showGeocodeError ||
      showEmptyHint ||
      (trimmed.length > 0 && trimmed.length < 2))

  return (
    <div
      ref={containerRef}
      className={cn(MAP_CHROME_STACK_LEFT, isOpen && 'z-[1100]')}
      data-search-open={isOpen ? '1' : '0'}
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
          title="Search leads or address"
        >
          <Search />
        </Button>
      ) : (
        <div
          className="map-search-open-pill relative flex items-center rounded-md shadow-lg touch-manipulation border border-white/60 bg-white/30 text-gray-900 backdrop-blur-sm"
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
            placeholder="Search leads or address..."
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

      <div
        className={cn(
          'map-chrome-slot relative flex shrink-0 items-center justify-center transition-opacity duration-150',
          isOpen && 'opacity-0 pointer-events-none'
        )}
        aria-hidden={isOpen || undefined}
      >
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
            tabIndex={isOpen ? -1 : undefined}
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
            tabIndex={isOpen ? -1 : undefined}
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
            tabIndex={isOpen ? -1 : undefined}
          >
            {isMultiSelectActive ? <CheckSquare /> : <Square />}
          </Button>
        )}
      </div>

      <div
        className={cn(
          'map-chrome-slot flex shrink-0 items-center justify-center transition-opacity duration-150',
          isOpen && 'opacity-0 pointer-events-none'
        )}
        aria-hidden={isOpen || undefined}
      >
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
          tabIndex={isOpen ? -1 : undefined}
        >
          <Route />
        </Button>
      </div>

      {showResultsPanel && (
        <div
          className="map-search-results-panel map-panel absolute left-0 rounded-xl overflow-hidden z-50"
          style={openPillStyle}
          data-address-like={addressLike || addressLikeLive ? '1' : '0'}
          data-debounced-query={debouncedQuery}
        >
          {showGeocodeError && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-200">
              {geocodeError}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto parcel-details-scroll">
            {rows.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {rows.map((row) => {
                  const Icon = KIND_ICON[row.kind] || Search
                  return (
                    <li
                      key={row.key}
                      onClick={() => handleSelectRow(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectRow(row)
                        }
                      }}
                      role="option"
                      tabIndex={0}
                      className={cn(
                        'p-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-start gap-2',
                        row.nested && 'pl-8'
                      )}
                    >
                      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {row.label}
                        </div>
                        {row.secondary && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {row.secondary}
                          </div>
                        )}
                        {row.kind === 'address' && row.result?.address && (
                          <div className="text-xs text-gray-500 mt-1">
                            {[
                              row.result.address.city,
                              row.result.address.county,
                              row.result.address.stateLong || row.result.address.state,
                              row.result.address.zip
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : showEmptyHint ? (
              <div className="p-3 text-sm text-gray-600 text-center">
                <div>No results found for "{query}"</div>
                <div className="text-xs mt-2 text-gray-500">
                  Try: street address, city name, zip code, or coordinates (lat, lng)
                </div>
              </div>
            ) : trimmed.length > 0 && trimmed.length < 2 ? (
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
