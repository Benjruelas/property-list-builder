import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Edit2, MoreVertical, Trash2 } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from '../ui/panel-header'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { cn } from '@/lib/utils'

/** Same shell class as Create Deal — shared list-panel fullscreen styling. */
export const DEAL_TEMPLATE_PANEL_CLASS =
  'map-panel list-panel create-deal-panel fullscreen-panel flex flex-col min-h-0 p-0'

export const DEAL_TEMPLATE_LIST_ROW =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all'

export const DEAL_TEMPLATE_SAFE_HEADER_STYLE = PANEL_LIST_HEADER_STYLE

export const DEAL_TEMPLATE_SAFE_BODY_STYLE = {
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
}

const MENU_WIDTH = 180

export function useDealTemplateRowMenu(isOpen) {
  const [openId, setOpenId] = useState(null)
  const [menuAnchor, setMenuAnchor] = useState(null)

  const closeMenu = useCallback(() => {
    setOpenId(null)
    setMenuAnchor(null)
  }, [])

  const openMenu = useCallback(
    (id, e) => {
      e.stopPropagation()
      if (openId === id) {
        closeMenu()
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const pad = 8
      let top = rect.bottom + 4
      let left = rect.right - MENU_WIDTH
      if (left < pad) left = pad
      if (left + MENU_WIDTH > window.innerWidth - pad) {
        left = window.innerWidth - MENU_WIDTH - pad
      }
      const h = 120
      if (top + h > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - h - 4)
      }
      setMenuAnchor({ top, left })
      setOpenId(id)
    },
    [openId, closeMenu]
  )

  useEffect(() => {
    if (!isOpen) closeMenu()
  }, [isOpen, closeMenu])

  useEffect(() => {
    if (!openId) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, closeMenu])

  return { openId, menuAnchor, openMenu, closeMenu }
}

export function DealTemplateRowMenu({ openId, menuAnchor, onClose, onEdit, onDelete }) {
  if (!openId || !menuAnchor || typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-auto" data-deal-template-menu>
      <div className="fixed inset-0 z-[10000]" onClick={onClose} aria-hidden />
      <div
        className="map-panel list-panel hamburger-menu fixed z-[10001] min-w-[180px] max-w-[220px] rounded-xl py-1 overflow-hidden border border-white/15 bg-black/90 backdrop-blur-sm shadow-lg"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onEdit?.()
            onClose()
          }}
          className="hamburger-menu-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2"
        >
          <Edit2 className="h-4 w-4 flex-shrink-0" />
          Edit
        </button>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            onDelete?.()
            onClose()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onDelete?.()
              onClose()
            }
          }}
          className="list-panel-delete-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 cursor-pointer"
        >
          <Trash2 className="h-4 w-4 flex-shrink-0" />
          Delete
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  )
}

/**
 * Fullscreen deal-template dialog shell (matches CreateDealDialog / CreateLeadDialog).
 */
export function DealTemplatePanelShell({
  open,
  onOpenChange,
  title,
  icon,
  subtitle,
  description,
  headerActions,
  listMode = false,
  nestedOverlay = true,
  topLayer = true,
  children,
  footer,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={DEAL_TEMPLATE_PANEL_CLASS}
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
        onInteractOutside={(e) => {
          if (e.target.closest?.('[data-deal-template-menu]')) e.preventDefault()
        }}
      >
        <DialogHeader
          className={cn(
            PANEL_LIST_HEADER_CLASS,
            'flex-shrink-0 !text-left items-start w-full space-y-0',
            listMode ? 'pb-0 border-b-0' : 'pb-3'
          )}
          style={PANEL_LIST_HEADER_STYLE}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title={title}
            icon={icon}
            subtitle={subtitle}
            subtitleClassName={subtitle ? 'text-sm opacity-60 whitespace-normal' : undefined}
            titleClassName={subtitle ? 'text-left justify-start' : undefined}
            toolbarClassName={subtitle || headerActions ? 'w-full' : undefined}
          >
            {headerActions}
          </PanelHeader>
          {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0">
          {children}
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DealTemplatePanelScroll({ children, className }) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-3 space-y-1.5',
        className
      )}
      style={DEAL_TEMPLATE_SAFE_BODY_STYLE}
    >
      {children}
    </div>
  )
}

export function DealTemplatePanelFormFooter({ children }) {
  return (
    <div className="flex justify-end gap-2 pt-3 flex-shrink-0 border-t border-white/10 mt-3">
      {children}
    </div>
  )
}

export function DealTemplateEmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="text-center py-16">
      {Icon ? <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" /> : null}
      <p className="text-sm opacity-60">{title}</p>
      {hint ? <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">{hint}</p> : null}
      {action}
    </div>
  )
}
