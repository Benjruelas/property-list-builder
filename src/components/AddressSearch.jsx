import React, { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { getCountyFromCoords } from '@/utils/geoUtils'

/**
 * Address search component using Nominatim (OpenStreetMap) geocoding
 * Free, no API key required, but has rate limiting
 */
export function AddressSearch({ onLocationFound, mapInstanceRef }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim() || query.length < 3) {
      setResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query)
    }, 500) // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query])

  const performSearch = async (searchQuery) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      // Use Nominatim (OpenStreetMap) geocoding - free, no API key needed
      // Add Texas, USA to improve results for our area
      const encodedQuery = encodeURIComponent(`${searchQuery}, Texas, USA`)
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=5&addressdetails=1&extratags=1`

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PropertyListBuilder/1.0' // Required by Nominatim
        }
      })

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`)
      }

      const data = await response.json()
      setResults(data || [])
    } catch (err) {
      console.error('Geocoding error:', err)
      setError('Failed to search address. Please try again.')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectResult = (result) => {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const displayName = result.display_name || query

    // Get map instance from ref
    const map = mapInstanceRef?.current

    // Center map on the location
    if (map && typeof map.setView === 'function') {
      // Zoom to an appropriate level (street level) where parcels will be visible
      map.setView([lat, lng], 17, {
        animate: true,
        duration: 0.5
      })

      // Callback after a short delay to ensure map has moved
      setTimeout(() => {
        if (onLocationFound) {
          onLocationFound({ lat, lng, address: displayName })
        }
      }, 600)
    } else if (onLocationFound) {
      onLocationFound({ lat, lng, address: displayName })
    }

    // Close search
    setIsOpen(false)
    setQuery('')
    setResults([])
  }

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false)
      setQuery('')
      setResults([])
    } else {
      setIsOpen(true)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }

  return (
    <div className="absolute top-3 left-3 z-[1000]">
      <Button
        onClick={handleToggle}
        size="icon"
        variant={isOpen ? "default" : "outline"}
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Search address"
      >
        <Search className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>

      {isOpen && (
        <div className="absolute top-14 left-0 w-80 sm:w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="p-3 border-b border-gray-200 flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search address..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pr-8"
              />
              {isSearching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setIsOpen(false)
                setQuery('')
                setResults([])
              }}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {results.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {results.map((result, index) => {
                  // Check if this result is in a supported county
                  const lat = parseFloat(result.lat)
                  const lng = parseFloat(result.lon)
                  const county = getCountyFromCoords(lat, lng)
                  const supportedCounties = ['tarrant', 'dallas', 'ellis', 'johnson', 'parker']
                  const isSupported = supportedCounties.includes(county.toLowerCase())
                  
                  return (
                    <li
                      key={index}
                      onClick={() => handleSelectResult(result)}
                      className={cn(
                        "p-3 hover:bg-blue-50 cursor-pointer transition-colors",
                        !isSupported && "opacity-60"
                      )}
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {result.display_name}
                      </div>
                      {result.address && (
                        <div className="text-xs text-gray-500 mt-1">
                          {[
                            result.address.city,
                            result.address.county,
                            result.address.state
                          ].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {!isSupported && (
                        <div className="text-xs text-orange-600 mt-1 font-medium">
                          ⚠️ Parcels not available in this area
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : query.length >= 3 && !isSearching && !error ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                No results found
              </div>
            ) : query.length > 0 && query.length < 3 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                Type at least 3 characters to search
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

