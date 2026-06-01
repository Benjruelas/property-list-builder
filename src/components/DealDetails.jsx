import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronRight, Archive, ArrowRightLeft, Trash2, Upload, Download, FileText, Loader2, User, MoreVertical, Plus } from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { PanelBackButton } from './ui/panel-header'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { formatTimeInState } from '@/utils/dealPipeline'
import { uploadDealFile, downloadDealFile, deleteDealFile, MAX_FILE_BYTES } from '@/utils/dealFiles'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DealTasksSection } from './DealTasksSection'
import { DealFinancesPanel } from './DealLineItemsSection'
import { normalizeDealLineItems } from '@/utils/dealFinances'
import { fetchQuotes } from '@/utils/quotes'
import { QuoteStatusBadge } from './quotes/QuoteStatusBadge'
import { formatQuoteMoney } from '@/utils/quoteMath'

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

const MENU_WIDTH = 180

export function DealDetails({
  deal,
  pipeline,
  lead,
  closedRecord = null,
  onClose,
  onDealUpdate,
  onOpenLead,
  onRequestMoveDeal,
  onRequestCloseDeal,
  onRequestRemoveDeal,
  getToken,
  readOnly = false,
  nestedOverlay = true,
  leadLinkActive = false,
  pipelines = [],
  leads = [],
  teams = [],
  onPipelinesChange,
  onOpenScheduleAtDate,
  taskListEpoch = 0,
  onCreateQuoteForDeal,
}) {
  const d = closedRecord?.deal || deal
  const pipelineMeta = closedRecord?.closedFrom || pipeline
  const columns = pipelineMeta?.columns || pipeline?.columns || []
  const [notes, setNotes] = useState(d?.notes || '')
  const [notesDirty, setNotesDirty] = useState(false)
  const [payments, setPayments] = useState(d?.payments || [])
  const [costs, setCosts] = useState(d?.costs || [])

  useEffect(() => {
    setNotes(d?.notes || '')
    setNotesDirty(false)
    setPayments(
      Array.isArray(d?.payments) && d.payments.length > 0
        ? d.payments.map((p) => ({ ...p }))
        : []
    )
    setCosts(
      Array.isArray(d?.costs) && d.costs.length > 0
        ? d.costs.map((c) => ({ ...c }))
        : []
    )
  }, [d?.id])
  const [uploading, setUploading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef(null)
  const [dealQuotes, setDealQuotes] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!d?.id || !getToken) return
    let cancelled = false
    fetchQuotes(getToken, { dealId: d.id })
      .then((list) => { if (!cancelled) setDealQuotes(list) })
      .catch(() => { if (!cancelled) setDealQuotes([]) })
    return () => { cancelled = true }
  }, [d?.id, getToken, taskListEpoch])

  useEffect(() => {
    setMenuOpen(false)
  }, [d?.id])

  if (!d) return null

  const stageName = getColumnName(d.status, columns)
  const timeStr = formatTimeInState(d)
  const isClosed = !!closedRecord
  const showDealActions = !readOnly && !isClosed && (onRequestMoveDeal || onRequestCloseDeal || onRequestRemoveDeal)

  const closeMenu = () => {
    setMenuOpen(false)
  }

  const openMenu = (event) => {
    event.stopPropagation()
    menuTriggerRef.current = event.currentTarget
    setMenuOpen(true)
  }

  const persist = useCallback((updates) => {
    onDealUpdate?.({ ...d, ...updates, updatedAt: Date.now() })
  }, [d, onDealUpdate])

  const saveNotes = () => {
    if (!notesDirty) return
    persist({ notes })
    setNotesDirty(false)
    showToast('Notes saved', 'success')
  }

  const commitFinances = useCallback((nextPayments, nextCosts) => {
    if (readOnly || isClosed) return
    persist({
      payments: normalizeDealLineItems(nextPayments),
      costs: normalizeDealLineItems(nextCosts),
    })
  }, [persist, readOnly, isClosed])

  const handlePaymentsChange = (next) => {
    setPayments(next)
  }

  const handleCostsChange = (next) => {
    setCosts(next)
  }

  const handlePaymentsBlur = (nextPayments) => {
    commitFinances(nextPayments, costs)
  }

  const handleCostsBlur = (nextCosts) => {
    commitFinances(payments, nextCosts)
  }

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pipeline?.id) return
    if (file.size > MAX_FILE_BYTES) {
      showToast('File must be 10MB or smaller', 'error')
      return
    }
    setUploading(true)
    try {
      const record = await uploadDealFile(getToken, {
        pipelineId: pipeline.id,
        dealId: d.id,
        file,
      })
      persist({ files: [...(d.files || []), record] })
      showToast('File uploaded', 'success')
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteFile = async (file) => {
    const ok = await showConfirm('Delete this file?', 'This cannot be undone.')
    if (!ok) return
    try {
      await deleteDealFile(getToken, { key: file.key, pipelineId: pipeline?.id })
      persist({ files: (d.files || []).filter((f) => f.id !== file.id) })
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.() }}>
      <DialogContent
        className="map-panel list-panel deal-details-panel fullscreen-panel flex flex-col min-h-0 p-0 gap-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
      >
        <DialogHeader
          className="shrink-0 border-b border-white/10 px-5 pt-5 pb-3 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">Deal details</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <PanelBackButton onClick={onClose} />
              <DialogTitle className="text-xl font-semibold truncate flex-1 min-w-0">
                {d.title || d.leadAddress || 'Deal'}
              </DialogTitle>
            </div>
            {showDealActions && (
              <div className="map-panel-header-actions gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(menuOpen && 'opacity-90')}
                  onClick={openMenu}
                  title="Options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-5 min-h-0"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="space-y-2 pb-4 border-b border-white/10">
            {(lead || d.leadName) && (
              lead ? (
                <button
                  type="button"
                  onClick={() => onOpenLead?.(lead)}
                  className={cn(
                    'w-full flex items-center gap-2 text-sm py-1 text-left transition-colors',
                    leadLinkActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                  )}
                  aria-current={leadLinkActive ? 'true' : undefined}
                >
                  <User className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate flex-1">
                    {d.leadName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lead'}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm py-1 opacity-80">
                  <User className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate">{d.leadName}</span>
                </div>
              )
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="leads-stage-badge text-[11px] px-2 py-0.5 rounded-full">
                {isClosed ? 'Closed' : stageName}
              </span>
              {!isClosed && timeStr && <span className="text-[11px] opacity-40">{timeStr}</span>}
            </div>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase opacity-50 mb-2">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
              onBlur={saveNotes}
              disabled={readOnly || isClosed}
              rows={4}
              className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 resize-none"
              placeholder="Deal notes…"
            />
          </section>

          <DealFinancesPanel
            payments={payments}
            costs={costs}
            onPaymentsChange={handlePaymentsChange}
            onCostsChange={handleCostsChange}
            onPaymentsCommit={handlePaymentsBlur}
            onCostsCommit={handleCostsBlur}
            readOnly={readOnly || isClosed}
          />

          {!readOnly && !isClosed && onCreateQuoteForDeal && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase opacity-50">Quotes</h3>
                <Button size="sm" variant="outline" onClick={() => onCreateQuoteForDeal({ deal: d, pipeline, lead })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create quote
                </Button>
              </div>
              {dealQuotes.length === 0 ? (
                <p className="text-xs opacity-40 py-1">No quotes linked to this deal</p>
              ) : (
                <ul className="space-y-1">
                  {dealQuotes.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 py-2 px-2 rounded-lg bg-white/[0.04] text-sm">
                      <QuoteIcon className="h-4 w-4 shrink-0 opacity-50" />
                      <span className="flex-1 truncate">{q.title || 'Quote'}</span>
                      <QuoteStatusBadge status={q.status} />
                      <span className="text-xs opacity-50 shrink-0">{formatQuoteMoney(q.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <DealTasksSection
            deal={d}
            lead={lead}
            pipeline={pipelineMeta}
            leads={leads}
            pipelines={pipelines}
            teams={teams}
            getToken={getToken}
            onPipelinesChange={onPipelinesChange}
            onOpenScheduleAtDate={onOpenScheduleAtDate}
            refreshKey={taskListEpoch}
            readOnly={readOnly || isClosed}
          />

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase opacity-50">Files</h3>
              {!readOnly && !isClosed && (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                  <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-3.5 w-3.5 mr-1" /> Upload</>}
                  </Button>
                </>
              )}
            </div>
            <p className="text-[10px] opacity-40 mb-2">Max 10MB per file</p>
            <ul className="space-y-1">
              {(d.files || []).length === 0 && (
                <li className="text-xs opacity-40 py-2">No files</li>
              )}
              {(d.files || []).map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.04]">
                  <FileText className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="flex-1 text-sm truncate">{f.name}</span>
                  <span className="text-[10px] opacity-40">{(f.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => downloadDealFile(getToken, f.key, f.name)} title="Download">
                    <Download className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                  </button>
                  {!readOnly && !isClosed && (
                    <button type="button" onClick={() => handleDeleteFile(f)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 opacity-40 hover:opacity-80" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>

      <OptionsMenuDropdown
        open={menuOpen}
        onClose={closeMenu}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-deal-details-menu"
      >
        {onRequestMoveDeal && (
          <OptionsMenuItem onClick={() => { closeMenu(); onRequestMoveDeal(d, pipeline?.id ?? pipeline) }}>
            <ArrowRightLeft className="h-4 w-4 shrink-0" />
            Move pipe
          </OptionsMenuItem>
        )}
        {onRequestCloseDeal && (
          <OptionsMenuItem onClick={() => { closeMenu(); onRequestCloseDeal(d, pipeline?.id ?? pipeline) }}>
            <Archive className="h-4 w-4 shrink-0" />
            Close
          </OptionsMenuItem>
        )}
        {onRequestRemoveDeal && (
          <OptionsMenuItem
            destructive
            className="list-panel-delete-btn rounded-b-xl pb-2 hover:bg-red-600/80"
            onClick={() => { closeMenu(); onRequestRemoveDeal(d, pipeline?.id ?? pipeline) }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Remove
          </OptionsMenuItem>
        )}
      </OptionsMenuDropdown>
    </Dialog>
  )
}

export default DealDetails
