import { useState, useMemo } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { getLeadPhones, getLeadEmails } from '@/utils/leadContact'
import { ENTITY_ROW_CLASS } from '../pickers/entityPickerShared'
import { cn } from '@/lib/utils'

function filterLeads(leads, query) {
  const q = query.toLowerCase().trim()
  const sorted = [...leads].sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  )
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((lead) => {
    const name = displayLeadName(lead).toLowerCase()
    const address = (lead.address || '').toLowerCase()
    const searchable = [name, address, ...getLeadEmails(lead), ...getLeadPhones(lead)].filter(Boolean).join(' ')
    return tokens.every((tok) => searchable.includes(tok))
  })
}

export function LeadPickerDialog({
  open,
  onClose,
  leads = [],
  parcelId = null,
  onSelectLead,
  onCreateLead,
  title = 'Select lead for photos',
  panelClassName,
  nestedOverlay = false,
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = filterLeads(leads, search)
    if (parcelId) {
      const match = list.find((l) => l.parcelId === parcelId)
      if (match) {
        list = [match, ...list.filter((l) => l.id !== match.id)]
      }
    }
    return list
  }, [leads, search, parcelId])

  const isSquarePanel = !!panelClassName

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className={cn(
          isSquarePanel
            ? 'map-panel list-panel lead-picker-dialog fullscreen-panel flex flex-col min-h-0 p-0 gap-0 overflow-hidden'
            : 'map-panel share-list-dialog lead-picker-dialog w-[min(92vw,24rem)] max-w-md max-h-[min(88vh,680px)] rounded-xl p-0 gap-0 overflow-hidden flex flex-col',
          panelClassName,
        )}
        showCloseButton={false}
        focusOverlay
        topLayer
        nestedOverlay={nestedOverlay}
        data-lead-picker-dialog
      >
        <div className={cn('flex flex-col min-h-0 flex-1', isSquarePanel ? 'px-0' : 'share-dialog-inner')}>
          <DialogHeader className={cn('shrink-0 relative', isSquarePanel ? 'px-5 pt-5 pb-3 border-b border-white/10 text-left' : 'share-dialog-header')}>
            <DialogTitle className={isSquarePanel ? 'text-lg font-semibold leading-tight' : 'share-dialog-title'}>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
            <button
              type="button"
              onClick={() => onClose?.()}
              className={isSquarePanel ? 'absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100' : 'share-dialog-close'}
              aria-label="Close"
              style={isSquarePanel ? { top: 'calc(1rem + env(safe-area-inset-top, 0px))' } : undefined}
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <div
            className={cn('flex flex-col min-h-0 flex-1', isSquarePanel ? 'px-5 py-4 space-y-3' : 'share-dialog-body space-y-3')}
            style={isSquarePanel ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' } : undefined}
          >
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                className="pl-9 min-h-[44px] bg-white/5 border-white/15"
              />
            </div>
            {onCreateLead && (
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px] shrink-0 share-dialog-btn share-dialog-btn--secondary"
                onClick={onCreateLead}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create new lead
              </Button>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2 pb-1">
              {filtered.length === 0 && (
                <p className="text-xs text-white/40 py-4 text-center">No leads found</p>
              )}
              {filtered.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className={cn(
                    ENTITY_ROW_CLASS,
                    'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]',
                    parcelId && lead.parcelId === parcelId && 'border-white/25 bg-white/[0.08]'
                  )}
                  onClick={() => onSelectLead?.(lead)}
                >
                  <span className="text-sm font-medium truncate">{displayLeadName(lead)}</span>
                  <span className="text-xs opacity-60 truncate">{formatLeadAddress(lead) || 'No address'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
