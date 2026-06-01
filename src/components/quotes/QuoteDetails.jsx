import { Send, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { PanelHeader } from '../ui/panel-header'
import { Button } from '../ui/button'
import { QuoteStatusBadge } from './QuoteStatusBadge'
import { QuoteLineItemsEditor } from './QuoteLineItemsEditor'
import { formatQuoteMoney } from '@/utils/quoteMath'
import { displayLeadName } from '@/utils/leads'
import { showConfirm } from '../ui/confirm-dialog'

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return '—'
  }
}

export function QuoteDetails({
  quote,
  open,
  onClose,
  onEdit,
  onSend,
  onDelete,
  onOpenDeal,
  leads = [],
}) {
  if (!quote) return null

  const vt = quote.viewTracking || {}
  const acceptedOptionalIds = quote.clientResponse?.selectedOptionalIds || []
  const displayTotal = quote.acceptedTotal ?? quote.total
  const lead = quote.leadId ? leads.find((l) => l.id === quote.leadId) : null
  const leadName = lead ? displayLeadName(lead) : (quote.clientName || null)
  const isLocked = ['accepted', 'paid', 'declined'].includes(quote.status)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent
        className="map-panel list-panel quotes-panel fullscreen-panel flex flex-col min-h-0 p-0 max-w-lg w-[min(96vw,32rem)]"
        showCloseButton={false}
        nestedOverlay
        topLayer
      >
        <DialogHeader style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
          <DialogDescription className="sr-only">Quote details</DialogDescription>
          <PanelHeader onBack={onClose} title={quote.title || 'Quote'}>
            <QuoteStatusBadge status={quote.status} />
          </PanelHeader>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4 space-y-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <div className="text-sm space-y-1 opacity-90">
            {leadName && <p><span className="opacity-60">Lead:</span> {leadName}</p>}
            {quote.validUntil && <p><span className="opacity-60">Valid until:</span> {quote.validUntil.slice(0, 10)}</p>}
          </div>

          <QuoteLineItemsEditor
            lineItems={quote.lineItems || []}
            taxRate={quote.taxRate || 0}
            readOnly
            locked={isLocked}
            showProfit
            selectedOptionalIds={
              quote.status === 'accepted' || quote.status === 'paid'
                ? acceptedOptionalIds
                : null
            }
          />

          {(quote.status === 'accepted' || quote.status === 'paid') && acceptedOptionalIds.length > 0 && (
            <p className="text-xs opacity-60">Client selected {acceptedOptionalIds.length} optional add-on(s). Accepted total: {formatQuoteMoney(displayTotal)}</p>
          )}

          {quote.notes && (
            <div>
              <h3 className="text-xs uppercase tracking-wide opacity-60 mb-1">Internal notes</h3>
              <p className="text-sm whitespace-pre-wrap opacity-90">{quote.notes}</p>
            </div>
          )}

          {quote.terms && (
            <div>
              <h3 className="text-xs uppercase tracking-wide opacity-60 mb-1">Internal terms</h3>
              <p className="text-sm whitespace-pre-wrap opacity-90">{quote.terms}</p>
            </div>
          )}

          {(vt.viewCount > 0 || quote.sentAt) && (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm space-y-1">
              <h3 className="text-xs uppercase tracking-wide opacity-60 mb-2">Activity</h3>
              {quote.sentAt && <p>Sent: {formatDateTime(quote.sentAt)}</p>}
              {vt.firstViewedAt && <p>First viewed: {formatDateTime(vt.firstViewedAt)}</p>}
              {vt.lastViewedAt && <p>Last viewed: {formatDateTime(vt.lastViewedAt)}</p>}
              {vt.viewCount > 0 && <p>Views: {vt.viewCount}</p>}
              {quote.paidAt && <p className="text-green-400">Paid: {formatDateTime(quote.paidAt)} ({formatQuoteMoney(displayTotal)})</p>}
            </div>
          )}

          {quote.clientResponse && (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm">
              <h3 className="text-xs uppercase tracking-wide opacity-60 mb-1">Client response</h3>
              <p className="capitalize">{quote.clientResponse.action?.replace('_', ' ')}</p>
              {quote.clientResponse.message && <p className="mt-1 opacity-90 whitespace-pre-wrap">{quote.clientResponse.message}</p>}
              <p className="text-xs opacity-50 mt-1">{formatDateTime(quote.clientResponse.respondedAt)}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {quote.status !== 'paid' && (
              <>
                <Button className="create-list-btn w-full" onClick={() => onSend?.(quote)}>
                  <Send className="h-4 w-4 mr-2" /> Send quote
                </Button>
                {quote.status === 'draft' && (
                  <Button variant="outline" className="w-full" onClick={() => onEdit?.(quote)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                )}
              </>
            )}
            {quote.dealId && onOpenDeal && (
              <Button variant="outline" className="w-full" onClick={() => onOpenDeal(quote)}>
                <ExternalLink className="h-4 w-4 mr-2" /> Open linked deal
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-red-400 hover:text-red-300"
              onClick={async () => {
                const ok = await showConfirm({ title: 'Delete quote?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true })
                if (ok) onDelete?.(quote)
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
