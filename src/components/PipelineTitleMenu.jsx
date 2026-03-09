import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Share2, Trash2, Pencil, Users } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'

/**
 * Pipeline title with dropdown menu (Share, Delete, Rename).
 * Rendered once per pipeline - each pipeline gets its own instance.
 * Self-contained: manages its own menu and rename state.
 */
export function PipelineTitleMenu({
  pipeline,
  isActive,
  isShared,
  canEdit,
  onSelect,
  onShare,
  onDelete,
  onRename
}) {
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(pipeline?.title || 'Pipeline 1')
  const inputRef = useRef(null)

  useEffect(() => {
    setRenameValue(pipeline?.title || 'Pipeline 1')
  }, [pipeline?.title])

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleRenameSubmit = () => {
    const trimmed = (renameValue || '').trim() || 'Pipeline 1'
    if (trimmed && onRename) {
      onRename(trimmed)
    }
    setIsRenaming(false)
    setRenameValue(pipeline?.title || 'Pipeline 1')
    setMenuAnchor(null)
  }

  const handleRenameClick = () => {
    setIsRenaming(true)
    setMenuAnchor(null)
  }

  const handleMenuOpen = (e) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const menuWidth = 180
    const menuHeight = 140 // Share + Rename + Delete + padding
    const padding = 8
    let top = rect.bottom + 4
    let left = rect.right - menuWidth
    if (typeof window !== 'undefined') {
      left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding))
      // On mobile: open upward if not enough space below so full menu (Share, Rename, Delete) is visible
      if (top + menuHeight > window.innerHeight - padding) {
        top = rect.top - menuHeight - 4
      }
      top = Math.max(padding, Math.min(top, window.innerHeight - menuHeight - padding))
    }
    setMenuAnchor({ top, left })
  }

  const handleMenuClose = () => setMenuAnchor(null)

  const title = pipeline?.title || 'Pipeline 1'

  return (
    <>
      <div
        className={cn(
          'pipeline-title-btn flex flex-row items-center justify-between gap-2 px-4 py-2 rounded-lg text-lg md:text-base font-semibold whitespace-nowrap transition-all min-w-0 border-0 shrink-0',
isActive
              ? 'bg-white/[0.12] text-white shadow-lg backdrop-blur-md'
            : 'bg-transparent text-white/90 hover:text-white'
        )}
        title={title}
      >
        {isRenaming ? (
          <Input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') {
                setIsRenaming(false)
                setRenameValue(title)
                handleMenuClose()
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-8 text-base border-white/30 bg-white/10 w-36"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onSelect}
              className="flex-1 min-w-0 flex items-center gap-2 text-left bg-transparent border-none p-0 font-semibold text-inherit cursor-pointer"
            >
              <span className="truncate max-w-[160px]">{title}</span>
              {isShared && (
                <Users className="h-3.5 w-3.5 flex-shrink-0 text-white/70" title="Shared with you" aria-hidden />
              )}
            </button>
            {canEdit && (
              <button
                type="button"
                className={cn(
                  'p-0.5 -m-0.5 rounded pipeline-icon-btn pipeline-options-btn shrink-0 ml-auto opacity-70 hover:opacity-100 flex items-center justify-center',
                  menuAnchor && 'opacity-90'
                )}
                onClick={handleMenuOpen}
                title="Pipeline options"
                aria-label="Pipeline options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {menuAnchor && typeof document !== 'undefined' && createPortal(
        <div data-pipeline-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={handleMenuClose} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-xl min-w-[180px] pt-1 pb-1 overflow-y-auto max-h-[70vh]"
            style={{ top: menuAnchor.top, left: menuAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {onShare && (
              <button
                type="button"
                onClick={() => { handleMenuClose(); onShare() }}
                className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 hover:bg-gray-100 transition-colors"
              >
                <Share2 className="h-4 w-4 flex-shrink-0" />
                Share
              </button>
            )}
            <button
              type="button"
              onClick={handleRenameClick}
              className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <Pencil className="h-4 w-4 flex-shrink-0" />
              Rename
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => { handleMenuClose(); onDelete() }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 flex items-center gap-2 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                Delete
              </button>
            )}
          </div>
        </div>,
        document.getElementById('modal-root') || document.body
      )}
    </>
  )
}
