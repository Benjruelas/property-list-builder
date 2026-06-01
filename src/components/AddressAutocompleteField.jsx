import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { useMapboxGeocode } from '@/hooks/useMapboxGeocode'
import { cn } from '@/lib/utils'

/**
 * Address field with Mapbox autocomplete for lead/property linking.
 */
export function AddressAutocompleteField({
  value,
  onChange,
  onSelectResult,
  placeholder = 'Start typing an address…',
  disabled = false,
  className,
}) {
  const containerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const { query, setQuery, results, isSearching, clear } = useMapboxGeocode({
    debounceMs: 300,
    types: 'address,poi',
    limit: 6,
  })

  useEffect(() => {
    if (value !== query) setQuery(value || '')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync external value
  }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (r) => {
    const addr = r.place_name || r.address?.line1 || ''
    const latParsed = r.center?.[1] ?? (r.lat != null ? parseFloat(r.lat) : null)
    const lngParsed = r.center?.[0] ?? (r.lon != null ? parseFloat(r.lon) : null)
    onChange?.(addr)
    onSelectResult?.({
      address: addr,
      latParsed,
      lngParsed,
      result: r,
    })
    setOpen(false)
    clear()
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange?.(e.target.value)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full text-sm rounded-lg pl-9 pr-9 py-2 bg-white/5 border border-white/15"
          autoComplete="off"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin opacity-50" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-[2000] mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-white/15 bg-black/90 backdrop-blur-md shadow-lg py-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 truncate"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
              >
                {r.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressAutocompleteField
