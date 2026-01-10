import React, { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { getCountyFromCoords } from '@/utils/geoUtils'

/**
 * Enhanced address search with intelligent query parsing and multiple geocoding strategies
 * Handles: street addresses, coordinates, city names, zip codes, and partial addresses
 */
export function AddressSearch({ onLocationFound, mapInstanceRef }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  // Smart address normalization and parsing
  const normalizeQuery = (rawQuery) => {
    const trimmed = rawQuery.trim()
    
    // Check if it's coordinates (e.g., "32.7767, -96.7970" or "32.7767,-96.7970")
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { type: 'coordinates', lat, lng, original: trimmed }
      }
    }
    
    // Normalize address: remove extra spaces, handle common abbreviations
    let normalized = trimmed
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/\b(street|st\.?)\b/gi, 'St')
      .replace(/\b(avenue|ave\.?)\b/gi, 'Ave')
      .replace(/\b(road|rd\.?)\b/gi, 'Rd')
      .replace(/\b(drive|dr\.?)\b/gi, 'Dr')
      .replace(/\b(boulevard|blvd\.?)\b/gi, 'Blvd')
      .replace(/\b(lane|ln\.?)\b/gi, 'Ln')
      .replace(/\b(court|ct\.?)\b/gi, 'Ct')
      .replace(/\b(place|pl\.?)\b/gi, 'Pl')
      .trim()
    
    return { type: 'address', query: normalized, original: trimmed }
  }

  // Generate multiple search query variations
  const generateSearchQueries = (normalizedQuery) => {
    const queries = []
    const original = normalizedQuery.original
    
    // Extract potential components
    const parts = original.split(',').map(p => p.trim()).filter(Boolean)
    const hasZip = /\b\d{5}(-\d{4})?\b/.test(original)
    const hasState = /\b(tx|texas)\b/i.test(original)
    const hasCity = parts.length >= 2
    
    // Query 1: Original query (for complete addresses)
    queries.push(original)
    
    // Query 2: Add "Texas, USA" if not present
    if (!hasState && !hasCity) {
      queries.push(`${original}, Texas, USA`)
    } else if (!hasState) {
      queries.push(`${original}, Texas`)
    }
    
    // Query 3: For street addresses, try with DFW area cities
    if (parts.length >= 2 && parts[0].match(/\d+/)) {
      // Looks like a street address
      const streetPart = parts[0]
      if (parts.length === 1) {
        // Just street, add common DFW cities
        queries.push(`${streetPart}, Fort Worth, TX`)
        queries.push(`${streetPart}, Dallas, TX`)
        queries.push(`${streetPart}, Arlington, TX`)
      } else if (parts.length === 2) {
        // Street + city, add state
        queries.push(`${streetPart}, ${parts[1]}, TX`)
      }
    }
    
    // Query 4: If zip code found, search by zip
    if (hasZip) {
      const zipMatch = original.match(/\b(\d{5}(-\d{4})?)\b/)
      if (zipMatch) {
        queries.push(`${zipMatch[1]}, Texas`)
      }
    }
    
    // Query 5: Try with bounding box for DFW area (for any Texas-related query)
    if (hasState || hasCity || /\b(7[6-7]\d{3}|75\d{3})\b/.test(original) || /\b\d+\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|ct|court|pl|place)\b/i.test(original)) {
      queries.push(`${original}, DFW, Texas`)
    }
    
    return [...new Set(queries)] // Remove duplicates
  }

  // Perform geocoding with multiple strategies
  const performSearch = async (rawQuery) => {
    if (!rawQuery.trim() || rawQuery.length < 2) {
      return
    }

    setIsSearching(true)
    setError(null)
    setResults([])

    try {
      // Normalize and parse query
      const normalized = normalizeQuery(rawQuery)
      
      // Handle coordinates directly
      if (normalized.type === 'coordinates') {
        const { lat, lng } = normalized
        const county = getCountyFromCoords(lat, lng)
        const supportedCounties = ['tarrant', 'dallas', 'ellis', 'johnson', 'parker']
        const isSupported = supportedCounties.includes(county.toLowerCase())
        
        const coordinateResult = {
          display_name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat: lat.toString(),
          lon: lng.toString(),
          address: {
            county: county.charAt(0).toUpperCase() + county.slice(1) + ' County',
            state: 'Texas'
          },
          _isCoordinate: true,
          _isSupported: isSupported
        }
        
        setResults([coordinateResult])
        setIsSearching(false)
        return
      }
      
      // Generate multiple query variations
      const searchQueries = generateSearchQueries(normalized)
      console.log('🔍 Search queries generated:', searchQueries)
      
      // DFW area bounding box for viewbox parameter
      const viewbox = '-99.5,31.5,-96.0,33.5' // minLon,minLat,maxLon,maxLat
      
      // Try each query strategy in parallel (with rate limiting awareness)
      const allResults = []
      const seenPlaceIds = new Set()
      
      for (const searchQuery of searchQueries.slice(0, 5)) { // Limit to 5 strategies to avoid rate limiting
        try {
          const encodedQuery = encodeURIComponent(searchQuery)
          
          // Use structured query for better results when possible
          const isStructured = searchQuery.includes(',') && searchQuery.split(',').length >= 2
          
          let url
          if (isStructured && searchQuery.includes('TX') || searchQuery.includes('Texas')) {
            // Use structured query with viewbox for Texas addresses
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=8&addressdetails=1&extratags=1&countrycodes=us&viewbox=${viewbox}&bounded=0&email=property-list-builder@example.com`
          } else {
            // Standard search with viewbox hint
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=8&addressdetails=1&extratags=1&countrycodes=us&viewbox=${viewbox}&bounded=0&email=property-list-builder@example.com`
          }
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'PropertyListBuilder/1.0 (https://property-list-builder.vercel.app)',
              'Accept-Language': 'en-US,en',
              'Referer': 'https://property-list-builder.vercel.app'
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            
            if (data && Array.isArray(data) && data.length > 0) {
              // Add results, avoiding duplicates
              for (const result of data) {
                if (result.place_id && !seenPlaceIds.has(result.place_id)) {
                  seenPlaceIds.add(result.place_id)
                  allResults.push(result)
                }
              }
              
              // If we have good results, we can stop early
              if (allResults.length >= 10) {
                break
              }
            }
          } else if (response.status === 429) {
            console.warn('Rate limited by Nominatim, slowing down...')
            // Wait a bit before next request
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (err) {
          console.warn(`Search failed for query "${searchQuery}":`, err.message)
          // Continue to next query
        }
        
        // Small delay between requests to respect rate limits
        if (searchQueries.indexOf(searchQuery) < searchQueries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      
      // Rank and filter results
      if (allResults.length > 0) {
        // Score and rank results
        const scoredResults = allResults.map(result => {
          let score = 0
          const address = result.address || {}
          const displayName = (result.display_name || '').toLowerCase()
          const queryLower = normalized.original.toLowerCase()
          
          // Boost Texas addresses
          if (address.state === 'Texas' || displayName.includes('texas')) {
            score += 100
          }
          
          // Boost addresses in DFW area (Tarrant, Dallas, and surrounding counties)
          const lat = parseFloat(result.lat)
          const lng = parseFloat(result.lon)
          if (lat >= 32.5 && lat <= 33.5 && lng >= -99.5 && lng <= -96.0) {
            score += 50
          }
          
          // Boost if query appears in display name
          const queryWords = queryLower.split(/\s+/)
          queryWords.forEach(word => {
            if (word.length >= 3 && displayName.includes(word)) {
              score += 10
            }
          })
          
          // Boost house/building numbers
          const hasNumber = /\d+/.test(queryLower) && /\d+/.test(displayName)
          if (hasNumber) {
            score += 20
          }
          
          // Boost addresses (has house number + street)
          if (address.house_number && address.road) {
            score += 30
          }
          
          // Penalize results too far from DFW
          if (lat < 31 || lat > 34 || lng < -100 || lng > -95) {
            score -= 50
          }
          
          return { ...result, _score: score }
        })
        
        // Sort by score (highest first), then by importance
        scoredResults.sort((a, b) => {
          if (b._score !== a._score) {
            return b._score - a._score
          }
          return (b.importance || 0) - (a.importance || 0)
        })
        
        // Limit to top 5 results
        const finalResults = scoredResults.slice(0, 5)
        console.log(`✅ Found ${allResults.length} total results, showing top ${finalResults.length}`)
        
        setResults(finalResults)
        setError(null)
      } else {
        console.warn('❌ No results found for any query variation')
        setResults([])
        setError(`No addresses found. Try: "123 Main St, Fort Worth, TX" or coordinates like "32.7767, -96.7970"`)
      }
    } catch (err) {
      console.error('❌ Search error:', err)
      setError(`Search failed: ${err.message}. Please try again.`)
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
    }, 400) // Slightly faster debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query])

  const handleSelectResult = (result) => {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const displayName = result.display_name || query

    const map = mapInstanceRef?.current

    if (map && typeof map.setView === 'function') {
      map.setView([lat, lng], 17, {
        animate: true,
        duration: 0.5
      })

      setTimeout(() => {
        if (onLocationFound) {
          onLocationFound({ lat, lng, address: displayName })
        }
      }, 600)
    } else if (onLocationFound) {
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
                placeholder="Search address or coordinates..."
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
                setError(null)
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
                  const lat = parseFloat(result.lat)
                  const lng = parseFloat(result.lon)
                  const county = getCountyFromCoords(lat, lng)
                  const supportedCounties = ['tarrant', 'dallas', 'ellis', 'johnson', 'parker']
                  const isSupported = supportedCounties.includes(county.toLowerCase())
                  
                  return (
                    <li
                      key={result.place_id || result._isCoordinate ? `coord-${lat}-${lng}` : index}
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
            ) : query.length >= 2 && !isSearching && !error ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                <div>No results found for "{query}"</div>
                <div className="text-xs mt-2 text-gray-400">
                  Try: street address, city name, zip code, or coordinates (lat, lng)
                </div>
              </div>
            ) : query.length > 0 && query.length < 2 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                Type at least 2 characters to search
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
