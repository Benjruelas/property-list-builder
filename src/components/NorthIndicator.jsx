import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * North indicator - shows geographic North direction on the rotating map.
 * Arrow rotates to always point toward North.
 */
export function NorthIndicator({ mapRef }) {
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    const map = mapRef?.current
    if (!map || typeof map.getBearing !== 'function') return

    const updateBearing = () => {
      setBearing(map.getBearing())
    }

    updateBearing()
    map.on('moveend', updateBearing)
    map.on('rotate', updateBearing)

    return () => {
      map.off('moveend', updateBearing)
      map.off('rotate', updateBearing)
    }
  }, [mapRef])

  const indicator = (
    <div
      className={cn(
        'fixed north-indicator z-[900] flex items-center justify-center rounded-full shadow-lg pointer-events-none',
        'bg-white/10 backdrop-blur-md border border-white/30'
      )}
      style={{
        width: 40,
        height: 40,
      }}
      title="North"
      aria-label="North indicator"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white"
        style={{
          transform: `rotate(${-bearing}deg)`,
          transition: 'transform 0.15s ease-out',
        }}
      >
        <path d="M12 2v20M12 2l-4 6h8l-4-6z" />
      </svg>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(indicator, document.body) : null
}
