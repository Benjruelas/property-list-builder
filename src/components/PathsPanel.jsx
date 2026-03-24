import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, Eye, EyeOff, Trash2, MoreVertical, Pencil, Route, MapPin } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'

const PATH_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
]

export function PathsPanel({
  isOpen,
  onClose,
  paths = [],
  onPathsChange,
  onDeletePath,
  onRenamePath,
  visiblePathIds = [],
  onTogglePathVisibility,
  distanceUnit = 'miles'
}) {
  const [openDropdownPathId, setOpenDropdownPathId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null)
  const [renamingPathId, setRenamingPathId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setOpenDropdownPathId(null)
      setDropdownAnchor(null)
      setRenamingPathId(null)
      setRenameValue('')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && onPathsChange) onPathsChange()
  }, [isOpen, onPathsChange])

  useEffect(() => {
    if (renamingPathId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingPathId])

  const MENU_WIDTH = 160
  const MENU_PADDING = 8
  const openDropdown = (pathId, event) => {
    event.stopPropagation()
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < MENU_PADDING) left = MENU_PADDING
    if (left + MENU_WIDTH > window.innerWidth - MENU_PADDING) left = window.innerWidth - MENU_WIDTH - MENU_PADDING
    const menuHeight = 120
    if (top + menuHeight > window.innerHeight - MENU_PADDING) top = Math.max(MENU_PADDING, rect.top - menuHeight - 4)
    setDropdownAnchor({ top, left })
    setOpenDropdownPathId(pathId)
  }

  const closeDropdown = () => {
    setOpenDropdownPathId(null)
    setDropdownAnchor(null)
  }

  const handleStartRename = (path) => {
    setRenamingPathId(path.id)
    setRenameValue(path.name)
    closeDropdown()
  }

  const handleRenameSubmit = async (pathId) => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      showToast('Name cannot be empty', 'error')
      return
    }
    try {
      if (onRenamePath) await onRenamePath(pathId, trimmed)
      showToast('Path renamed', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to rename', 'error')
    }
    setRenamingPathId(null)
    setRenameValue('')
  }

  const handleDeleteClick = (path) => {
    closeDropdown()
    if (onDeletePath) onDeletePath(path)
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const allPaths = paths || []

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent
          className="map-panel list-panel fullscreen-panel"
          showCloseButton={false}
          hideOverlay
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-paths-panel-dropdown]')) e.preventDefault()
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">View and manage your recorded GPS paths</DialogDescription>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-semibold">Paths</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onPathsChange?.()}
                  title="Refresh paths"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="space-y-4">
              {allPaths.length === 0 ? (
                <div className="text-center py-8">
                  <Route className="h-10 w-10 mx-auto mb-3 text-gray-400 opacity-60" />
                  <p className="text-gray-500 text-sm">No paths recorded yet.</p>
                  <p className="text-gray-400 text-xs mt-1">Tap the record button on the map to start tracking.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allPaths.map((path, idx) => {
                    const isVisible = visiblePathIds.includes(path.id)
                    const color = PATH_COLORS[idx % PATH_COLORS.length]
                    const isRenaming = renamingPathId === path.id

                    return (
                      <div
                        key={path.id}
                        className={cn(
                          "flex items-center justify-between p-3 border-2 rounded-lg transition-all cursor-pointer",
                          isVisible
                            ? ""
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        )}
                        style={isVisible ? {
                          borderColor: color,
                          backgroundColor: 'rgba(255, 255, 255, 0.06)'
                        } : undefined}
                        onClick={() => {
                          if (!isRenaming && onTogglePathVisibility) onTogglePathVisibility(path.id)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isVisible && (
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                            )}
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameSubmit(path.id)
                                  if (e.key === 'Escape') { setRenamingPathId(null); setRenameValue('') }
                                }}
                                onBlur={() => handleRenameSubmit(path.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-sm bg-transparent border-b border-white/40 outline-none w-full"
                              />
                            ) : (
                              <span className="font-medium text-sm truncate">{path.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{formatDate(path.createdAt)}</span>
                            {typeof path.distanceMiles === 'number' && path.distanceMiles > 0 && (
                              <>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-500">
                                  {distanceUnit === 'km'
                                    ? `${Math.round(path.distanceMiles * 1.60934 * 100) / 100} km`
                                    : `${path.distanceMiles} mi`}
                                </span>
                              </>
                            )}
                            {path.points && (
                              <>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-500">{path.points.length} pts</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="relative ml-2 flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (onTogglePathVisibility) onTogglePathVisibility(path.id)
                            }}
                            title={isVisible ? 'Hide path' : 'Show on map'}
                          >
                            {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-50" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", openDropdownPathId === path.id && "opacity-90")}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDropdownPathId === path.id ? closeDropdown() : openDropdown(path.id, e)
                            }}
                            title="Path options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {openDropdownPathId && dropdownAnchor && typeof document !== 'undefined' && createPortal(
        (() => {
          const path = allPaths.find(p => p.id === openDropdownPathId)
          if (!path) return null
          return (
            <div data-paths-panel-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
              <div className="fixed inset-0 z-[10001]" onClick={closeDropdown} aria-hidden />
              <div
                className="map-panel list-panel fixed z-[10002] rounded-xl min-w-[160px] pt-1 overflow-hidden"
                style={{ top: dropdownAnchor.top, left: dropdownAnchor.left }}
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleStartRename(path)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                >
                  <Pencil className="h-4 w-4 flex-shrink-0" />
                  Rename
                </button>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeleteClick(path)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDeleteClick(path)}
                  className="list-panel-delete-btn w-full px-3 py-2 pb-2 rounded-b-xl text-left text-sm flex items-center gap-2 transition-colors text-red-400 hover:bg-red-600/80 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 flex-shrink-0" />
                  Delete
                </div>
              </div>
            </div>
          )
        })(),
        document.getElementById('modal-root') || document.body
      )}
    </>
  )
}
