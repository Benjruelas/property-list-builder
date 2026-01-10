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
      // Try multiple search strategies for better results
      
      // Try multiple search strategies for better results
      let data = []
      
      // Strategy 1: Search as-is (for complete addresses like "123 Main St, Fort Worth, TX")
      let encodedQuery = encodeURIComponent(searchQuery)
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=10&addressdetails=1&extratags=1`
      
      console.log('🔍 Searching for address:', searchQuery)
      console.log('Query URL:', url)

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'PropertyListBuilder/1.0', // Required by Nominatim
            'Accept-Language': 'en-US,en'
          }
        })

        if (response.ok) {
          data = await response.json()
          console.log('Nominatim results (direct):', data.length, 'results')
        }
      } catch (err) {
        console.warn('First search attempt failed:', err)
      }
      
      // Strategy 2: If no results or few results, try with Texas, USA appended
      if (!data || data.length < 3) {
        console.log('Trying search with Texas, USA suffix...')
        encodedQuery = encodeURIComponent(`${searchQuery}, Texas, USA`)
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=10&addressdetails=1&extratags=1`
        
        try {
          const response2 = await fetch(url, {
            headers: {
              'User-Agent': 'PropertyListBuilder/1.0',
              'Accept-Language': 'en-US,en'
            }
          })
          
          if (response2.ok) {
            const data2 = await response2.json()
            console.log('Nominatim results (with Texas suffix):', data2.length, 'results')
            // Merge results, avoiding duplicates
            if (data2 && data2.length > 0) {
              const existingIds = new Set(data.map(r => r.place_id))
              const newResults = data2.filter(r => !existingIds.has(r.place_id))
              data = [...data, ...newResults]
            }
          }
        } catch (err) {
          console.warn('Second search attempt failed:', err)
        }
      }
      
      // Strategy 3: Try with bounding box for DFW area if still no good results
      if (!data || data.length === 0) {
        console.log('Trying search with DFW area bounding box...')
        encodedQuery = encodeURIComponent(`${searchQuery}, DFW, Texas`)
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=10&addressdetails=1&extratags=1&bounded=1&viewbox=-99.5,31.5,-96.0,33.5`
        
        try {
          const response3 = await fetch(url, {
            headers: {
              'User-Agent': 'PropertyListBuilder/1.0',
              'Accept-Language': 'en-US,en'
            }
          })
          
          if (response3.ok) {
            const data3 = await response3.json()
            console.log('Nominatim results (with bounding box):', data3?.length || 0, 'results')
            if (data3 && data3.length > 0) {
              data = data3
            }
          }
        } catch (err) {
          console.warn('Third search attempt failed:', err)
        }
      }

      // Filter results to prioritize Texas addresses
      if (data && data.length > 0) {
        console.log(`✅ Found ${data.length} total results`)
        
        // Sort: Texas addresses first, then others
        const sortedData = data.sort((a, b) => {
          const aIsTexas = a.address?.state === 'Texas' || a.display_name?.includes('Texas') || false
          const bIsTexas = b.address?.state === 'Texas' || b.display_name?.includes('Texas') || false
          if (aIsTexas && !bIsTexas) return -1
          if (!aIsTexas && bIsTexas) return 1
          return 0
        })
        
        // Limit to top 5 results
        const finalResults = sortedData.slice(0, 5)
        console.log(`✅ Showing ${finalResults.length} results to user`)
        setResults(finalResults)
        setError(null)
      } else {
        console.warn('❌ No results found for query:', searchQuery)
        setResults([])
        setError(`No addresses found for "${searchQuery}". Try including: street number, street name, city, and state (e.g., "123 Main St, Fort Worth, TX").`)
      }
    } catch (err) {
      console.error('❌ Geocoding error:', err)
      setError(`Search failed: ${err.message}. Please check your connection and try again.`)
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
    <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 sm:gap-2 md:gap-2">
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
        <div className="absolute top-[calc(48px+8px)] sm:top-[calc(40px+8px)] left-0 w-80 sm:w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
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
                <div>No results found for "{query}"</div>
                <div className="text-xs mt-2 text-gray-400">
                  Try including street number, city name, or zip code
                </div>
              </div>
            ) : query.length > 0 && query.length < 3 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                Type at least 3 characters to search
              </div>
            ) : null}
            
            {error && !isSearching && (
              <div className="p-3 text-xs text-gray-500 text-center">
                Tip: Try searching with street number, street name, city, and state
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

