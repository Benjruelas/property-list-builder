import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListFilter } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { TagFilterBar } from './TagFilterBar'
import {
  computeOptionsMenuPosition,
  getOptionsMenuPortalContainer,
  resolveOptionsMenuZIndex,
} from '@/utils/optionsMenuPortal'

const MENU_WIDTH = 280

const filterOptionClass = (active, extra = '') =>
  cn(
    'panel-filter-option',
    active && 'panel-filter-option--active',
    extra
  )

/**
 * Filter icon that opens a portaled menu. Tags are the default section;
 * optional status and sort sections extend the same menu for list panels.
 */
export function PanelFilterMenu({
  tags = [],
  selectedTagIds = [],
  onTagIdsChange,
  statusOptions = null,
  statusFilter = null,
  onStatusFilterChange,
  statusCounts = null,
  sortOptions = null,
  sortMode = null,
  onSortModeChange,
  defaultSortMode = 'recent',
  className,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  const [zIndex, setZIndex] = useState({ panel: 10032, scrim: 10031, wrapper: 10030 })

  const hasStatus = Array.isArray(statusOptions) && statusOptions.length > 0 && onStatusFilterChange
  const hasSort = Array.isArray(sortOptions) && sortOptions.length > 0 && onSortModeChange
  const activeCount =
    selectedTagIds.length
    + (hasStatus && statusFilter ? 1 : 0)
    + (hasSort && sortMode && sortMode !== defaultSortMode ? 1 : 0)

  const handleClearAll = () => {
    onTagIdsChange?.([])
    if (hasStatus) onStatusFilterChange(null)
    if (hasSort) onSortModeChange(defaultSortMode)
  }

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
  }, [open, activeCount, tags.length])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      const t = e.target
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const container = getOptionsMenuPortalContainer()

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        data-tour="panel-tag-filter"
        className={cn(
          'h-9 w-9 shrink-0 relative',
          activeCount > 0 && 'text-white',
          className
        )}
        title={
          activeCount > 0
            ? `Filters (${activeCount} active)`
            : 'Filter'
        }
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filter options"
      >
        <ListFilter className="h-4 w-4" />
        {activeCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500" aria-hidden />
        )}
      </Button>
      {open && position && container && createPortal(
        <div
          data-panel-filter-menu
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
            role="dialog"
            aria-label="Filter options"
            className="map-panel list-panel fixed rounded-xl border border-white/15 bg-[#1a1f2e] shadow-xl overflow-hidden"
            style={{
              top: position.top,
              left: position.left,
              zIndex: zIndex.panel,
              width: MENU_WIDTH,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
              <span className="text-sm font-medium">Filters</span>
              {activeCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-white/50 hover:text-white/80 transition-colors"
                  onClick={handleClearAll}
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="px-3 py-3 space-y-4 max-h-[min(420px,55vh)] overflow-y-auto scrollbar-hide">
              {hasStatus && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onStatusFilterChange(null)}
                      className={filterOptionClass(statusFilter === null)}
                      aria-pressed={statusFilter === null}
                    >
                      All
                    </button>
                    {statusOptions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onStatusFilterChange(statusFilter === s.id ? null : s.id)}
                        className={cn(
                          'panel-filter-option',
                          statusFilter === s.id
                            ? cn(s.color, 'panel-filter-option--status-active')
                            : ''
                        )}
                        aria-pressed={statusFilter === s.id}
                      >
                        {s.label}
                        {statusCounts?.[s.id] > 0 && (
                          <span className="opacity-60 ml-0.5">{statusCounts[s.id]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hasSort && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Sort</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSortModeChange(opt.id)}
                        className={filterOptionClass(sortMode === opt.id)}
                        aria-pressed={sortMode === opt.id}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Tags</p>
                {tags.length === 0 ? (
                  <p className="text-xs text-white/45 leading-relaxed">
                    No tags yet. Add tags from an item&apos;s options menu.
                  </p>
                ) : (
                  <TagFilterBar
                    tags={tags}
                    selectedIds={selectedTagIds}
                    onChange={onTagIdsChange}
                  />
                )}
              </div>
            </div>
          </div>
        </div>,
        container
      )}
    </>
  )
}
