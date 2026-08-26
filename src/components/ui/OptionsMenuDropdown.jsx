import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  computeOptionsMenuPosition,
  getOptionsMenuPortalContainer,
  resolveOptionsMenuZIndex,
} from '@/utils/optionsMenuPortal'

/**
 * Portaled ⋮ menu that stacks above the current dialog layer.
 */
export function OptionsMenuDropdown({
  open,
  onClose,
  triggerRef,
  anchorEl = null,
  menuWidth = 160,
  children,
  menuClassName,
  dataAttr = 'data-options-menu',
}) {
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  const [zIndex, setZIndex] = useState({ panel: 10032, scrim: 10031, wrapper: 10030 })

  const trigger = anchorEl ?? triggerRef?.current ?? null

  useLayoutEffect(() => {
    if (!open || !trigger) {
      setPosition(null)
      return undefined
    }
    const place = () => {
      setZIndex(resolveOptionsMenuZIndex(trigger))
      setPosition(computeOptionsMenuPosition(trigger, menuRef.current, menuWidth))
    }
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open, trigger, menuWidth])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      const t = e.target
      if (menuRef.current?.contains(t) || trigger?.contains(t)) return
      onClose?.()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose, trigger])

  if (!open || !position) return null
  const container = getOptionsMenuPortalContainer()
  if (!container) return null

  return createPortal(
    <div
      {...{ [dataAttr]: '' }}
      className="pointer-events-auto fixed inset-0"
      style={{ zIndex: zIndex.wrapper }}
    >
      <div
        className="fixed inset-0"
        style={{ zIndex: zIndex.scrim }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={menuRef}
        role="menu"
        className={cn(
          'map-panel list-panel hamburger-menu fixed rounded-xl py-1 overflow-hidden shadow-xl border border-white/15 bg-black/90 backdrop-blur-sm',
          menuClassName
        )}
        style={{
          top: position.top,
          left: position.left,
          zIndex: zIndex.panel,
          minWidth: menuWidth,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    container
  )
}

export function OptionsMenuItem({ onClick, children, className, destructive = false, disabled = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'hamburger-menu-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors',
        destructive ? 'text-red-400' : 'text-gray-900',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
