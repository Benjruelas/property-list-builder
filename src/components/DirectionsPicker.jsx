import { useState, useRef, useEffect } from 'react'
import { Navigation } from 'lucide-react'
import { Button } from './ui/button'

const DROPDOWN_CLASS = "absolute z-[10000] rounded-xl min-w-[220px] py-1 overflow-hidden shadow-xl border border-white/20 whitespace-nowrap"
const DROPDOWN_STYLE = { background: 'rgba(30, 30, 30, 0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }

const ICON_WRAP = "flex-shrink-0 h-5 w-5 flex items-center justify-center"

function GoogleIcon() {
  return (
    <span className={ICON_WRAP}>
      <svg viewBox="0 0 48 48" className="h-4 w-4">
        <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.1 24.1 0 0 0 0 21.56l7.98-6.19z"/>
        <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </span>
  )
}

function AppleIcon() {
  return (
    <span className={ICON_WRAP}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.17 4.36 9.02 8.7 8.76c1.26.07 2.13.72 2.91.77.99-.2 1.95-.77 3.01-.7 1.28.1 2.24.6 2.86 1.54-2.63 1.58-2 5.07.37 6.04-.45 1.18-.99 2.36-1.8 3.87zM12.03 8.7c-.1-2.35 1.87-4.37 4.07-4.57.31 2.64-2.36 4.63-4.07 4.57z"/></svg>
    </span>
  )
}

function openDirections(lat, lng, provider) {
  const url = provider === 'apple'
    ? `https://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`
  window.open(url, '_blank')
}

export function DirectionsPicker({ lat, lng, variant = 'icon', className = '', iconSize }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const disabled = lat == null || lng == null

  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  const handleSelect = (provider) => {
    setOpen(false)
    openDirections(lat, lng, provider)
  }

  const dropdown = (
    <div className={DROPDOWN_CLASS} style={{ ...DROPDOWN_STYLE, ...(variant === 'button' || iconSize ? { left: 0 } : { right: 0 }), top: '100%', marginTop: 4, position: 'absolute' }}>
      <button
        type="button"
        onClick={() => handleSelect('google')}
        className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-3 hover:bg-white/10 transition-colors"
      >
        <GoogleIcon />
        Open with Google Maps
      </button>
      <button
        type="button"
        onClick={() => handleSelect('apple')}
        className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-3 hover:bg-white/10 transition-colors"
      >
        <AppleIcon />
        Open with Apple Maps
      </button>
    </div>
  )

  if (variant === 'button') {
    return (
      <div ref={ref} className={`relative ${className}`}>
        <Button
          variant="outline"
          size="sm"
          className="parcel-dropdown-btn flex-1 min-w-[120px]"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); setOpen(p => !p) }}
        >
          <Navigation className="h-4 w-4 mr-2" />
          Directions
        </Button>
        {open && dropdown}
      </div>
    )
  }

  if (iconSize) {
    return (
      <div ref={ref} className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); setOpen(p => !p) }}
          title="Get directions"
          className="pipeline-icon-btn bg-sky-600/80 hover:bg-sky-600 text-white transition-colors disabled:opacity-40"
          style={{ padding: 'inherit', borderRadius: 'inherit' }}
        >
          <Navigation size={iconSize} />
        </button>
        {open && dropdown}
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p) }}
        title="Get directions"
        className="parcel-details-link-btn"
      >
        <Navigation className="h-4 w-4" />
      </Button>
      {open && dropdown}
    </div>
  )
}
