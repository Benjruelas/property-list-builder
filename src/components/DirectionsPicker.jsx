import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Navigation } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import {
  computeOptionsMenuPosition,
  getOptionsMenuPortalContainer,
  resolveOptionsMenuZIndex,
} from '@/utils/optionsMenuPortal'
import { AppleMapsIcon, GoogleMapsIcon } from './directionsProviderIcons'

const MENU_WIDTH = 220
const DROPDOWN_CLASS = 'rounded-xl min-w-[220px] py-1 overflow-hidden shadow-xl border border-white/20 whitespace-nowrap'
const DROPDOWN_STYLE = { background: 'rgba(30, 30, 30, 0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }

function openDirections(lat, lng, provider) {
  const url = provider === 'apple'
    ? `https://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`
  window.open(url, '_blank')
}

function DirectionsMenu({ onSelect }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect('google')}
        className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-3 hover:bg-white/10 transition-colors"
      >
        <GoogleMapsIcon />
        Open with Google Maps
      </button>
      <button
        type="button"
        onClick={() => onSelect('apple')}
        className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-3 hover:bg-white/10 transition-colors"
      >
        <AppleMapsIcon />
        Open with Apple Maps
      </button>
    </>
  )
}

export function DirectionsPicker({ lat, lng, variant = 'icon', className = '', iconSize }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  const [zIndex, setZIndex] = useState({ panel: 10032, scrim: 10031, wrapper: 10030 })
  const disabled = lat == null || lng == null

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null)
      return undefined
    }
    const place = () => {
      setZIndex(resolveOptionsMenuZIndex(triggerRef.current))
      setPosition(computeOptionsMenuPosition(triggerRef.current, menuRef.current, MENU_WIDTH))
    }
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handleOutside = (e) => {
      const t = e.target
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  const handleSelect = (provider) => {
    setOpen(false)
    openDirections(lat, lng, provider)
  }

  const container = getOptionsMenuPortalContainer()
  const portaledMenu = open && position && container && createPortal(
    <div
      data-directions-picker-menu
      className="pointer-events-auto fixed inset-0"
      style={{ zIndex: zIndex.wrapper }}
    >
      <div
        className="fixed inset-0"
        style={{ zIndex: zIndex.scrim }}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        ref={menuRef}
        className={DROPDOWN_CLASS}
        style={{
          ...DROPDOWN_STYLE,
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: MENU_WIDTH,
          zIndex: zIndex.panel,
        }}
      >
        <DirectionsMenu onSelect={handleSelect} />
      </div>
    </div>,
    container
  )

  const toggle = (e) => {
    e.stopPropagation()
    setOpen((p) => !p)
  }

  if (variant === 'parcel-tile') {
    return (
      <div ref={triggerRef} className={cn('relative min-w-0 w-full', className)}>
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          title="Get directions"
          className="parcel-details-action-tile parcel-details-action-tile--directions w-full"
        >
          <Navigation className="parcel-details-action-icon" aria-hidden />
          <span className="parcel-details-action-label">Directions</span>
        </button>
        {portaledMenu}
      </div>
    )
  }

  if (variant === 'tile') {
    return (
      <div ref={triggerRef} className={`relative min-w-0 w-full ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          title="Open in maps"
          className="lead-detail-action-tile w-full"
        >
          <Navigation className="lead-detail-action-icon shrink-0 opacity-80" aria-hidden />
          <span className="lead-detail-action-label">Directions</span>
        </button>
        {portaledMenu}
      </div>
    )
  }

  if (variant === 'row') {
    return (
      <div ref={triggerRef} className={`relative w-full ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          className="w-full flex items-center gap-3 text-sm py-2 text-left hover:opacity-80 disabled:opacity-40"
        >
          <Navigation className="h-4 w-4 opacity-50 shrink-0" />
          <span>Directions</span>
        </button>
        {portaledMenu}
      </div>
    )
  }

  if (variant === 'button') {
    return (
      <div ref={triggerRef} className={`relative ${className}`}>
        <Button
          variant="outline"
          size="sm"
          className="parcel-dropdown-btn flex-1 min-w-[120px]"
          disabled={disabled}
          onClick={toggle}
        >
          <Navigation className="h-4 w-4 mr-2" />
          Directions
        </Button>
        {portaledMenu}
      </div>
    )
  }

  if (iconSize) {
    return (
      <div ref={triggerRef} className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          title="Get directions"
          className="pipeline-icon-btn bg-sky-600/80 hover:bg-sky-600 text-white transition-colors disabled:opacity-40"
          style={{ padding: 'inherit', borderRadius: 'inherit' }}
        >
          <Navigation size={iconSize} />
        </button>
        {portaledMenu}
      </div>
    )
  }

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={toggle}
        title="Get directions"
        className="parcel-details-link-btn"
      >
        <Navigation className="h-4 w-4" />
      </Button>
      {portaledMenu}
    </div>
  )
}
