import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronRight, Archive, ArrowRightLeft, Trash2, Upload, Download, FileText, Loader2, User, MoreVertical, Plus } from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { PanelBackButton } from './ui/panel-header'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange } from './ui/panelDialogUtils'
import { cn } from '@/lib/utils'
import { formatLeadAddress } from '@/utils/leads'
import { formatTimeInState } from '@/utils/dealPipeline'
import { uploadDealFile, downloadDealFile, deleteDealFile, fetchDealFileBlob, sumDealFileBytes, DEAL_STORAGE_LIMIT_BYTES } from '@/utils/dealFiles'
import { StorageUsageBar } from './ui/StorageUsageBar'
import { FilePreviewOverlay } from './ui/FilePreviewOverlay'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DealTasksSection } from './DealTasksSection'
import { DealFinancesPanel } from './DealLineItemsSection'
import { normalizeDealLineItems } from '@/utils/dealFinances'
import { fetchQuotes, getCachedDealQuotes, setCachedDealQuotes } from '@/utils/quotes'
import { QuoteStatusBadge } from './quotes/QuoteStatusBadge'
import { formatQuoteMoney } from '@/utils/quoteMath'
import { TagPicker } from './tags/TagPicker'

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

const MENU_WIDTH = 180

function DealDetailSectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="lead-detail-section-title">{children}</h3>
      {action}
    </div>
  )
}

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
  topLayer = true,
  obscuredByChild = false,
  leadLinkActive = false,
  pipelines = [],
  leads = [],
  teams = [],
  onPipelinesChange,
  onOpenScheduleAtDate,
  taskListEpoch = 0,
  quotesRefreshKey = 0,
  onCreateQuoteForDeal,
  onOpenQuote,
  canSeeDealAmounts = true,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
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
  const [dealQuotes, setDealQuotes] = useState(() =>
    d?.id ? getCachedDealQuotes(d.id) || [] : []
  )
  const [dealQuotesLoading, setDealQuotesLoading] = useState(false)
  const fileInputRef = useRef(null)
  const [previewFileIndex, setPreviewFileIndex] = useState(null)

  useEffect(() => {
    if (!d?.id || !getToken) {
      setDealQuotes([])
      setDealQuotesLoading(false)
      return
    }
    const cached = getCachedDealQuotes(d.id)
    if (cached) setDealQuotes(cached)
    setDealQuotesLoading(!cached)
    let cancelled = false
    fetchQuotes(getToken, { dealId: d.id, skipCache: true })
      .then((list) => {
        if (cancelled) return
        setCachedDealQuotes(d.id, list)
        setDealQuotes(list)
      })
      .catch(() => {
        if (!cancelled && !cached) setDealQuotes([])
      })
      .finally(() => {
        if (!cancelled) setDealQuotesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [d?.id, getToken, quotesRefreshKey])

  useEffect(() => {
    setMenuOpen(false)
  }, [d?.id])

  if (!d) return null

  const stageName = getColumnName(d.status, columns)
  const timeStr = formatTimeInState(d)
  const isClosed = !!closedRecord
  const showDealActions = !readOnly && !isClosed && (onRequestMoveDeal || onRequestCloseDeal || onRequestRemoveDeal)
  const address = d.leadAddress || (lead ? formatLeadAddress(lead) : '')
  const leadName = d.leadName || (lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : '')
  const pipelineTitle = pipelineMeta?.title || pipeline?.title || ''

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

  const dealFilesUsed = sumDealFileBytes(d.files)
  const dealStorageFull = dealFilesUsed >= DEAL_STORAGE_LIMIT_BYTES
  const dealFilePreviewItems = (d.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    contentType: f.contentType,
    loadBlob: () => fetchDealFileBlob(getToken, f.key),
  }))

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pipeline?.id) return
    setUploading(true)
    try {
      const record = await uploadDealFile(getToken, {
        pipelineId: pipeline.id,
        dealId: d.id,
        file,
        existingFiles: d.files || [],
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
    <Dialog
      open
      modal={false}
      onOpenChange={(open) => handlePanelDialogOpenChange(open, leadLinkActive, onClose, true)}
    >
      <DialogContent
        className={cn(
          'map-panel list-panel deal-details-panel fullscreen-panel flex flex-col min-h-0 p-0 gap-0',
          obscuredByChild && 'invisible opacity-0 pointer-events-none',
        )}
        showCloseButton={false}
        detailFocusOverlay={!obscuredByChild}
        hideOverlay={obscuredByChild}
        suppressBackdrop={obscuredByChild}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
      >
        <DialogHeader
          className="shrink-0 border-b border-white/10 px-5 pt-5 pb-4 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">Deal details</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <PanelBackButton onClick={onClose} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold truncate leading-tight">
                  {d.title || d.leadAddress || 'Deal'}
                </DialogTitle>
                {address && (
                  <p className="text-xs text-white/50 truncate mt-0.5" title={address}>{address}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="leads-stage-badge text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wide font-medium">
                    {isClosed ? 'Closed' : stageName}
                  </span>
                  {!isClosed && timeStr && (
                    <span className="text-[11px] text-white/40">{timeStr}</span>
                  )}
                  {pipelineTitle && (
                    <span className="text-[11px] text-white/40 truncate" title={pipelineTitle}>
                      {pipelineTitle}
                    </span>
                  )}
                </div>
              </div>
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
          className="lead-detail-body flex-1 overflow-y-auto scrollbar-hide min-h-0"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {(lead || leadName) && (
            <div className="px-5 py-4 border-b border-white/[0.08]">
              {lead ? (
                <button
                  type="button"
                  onClick={() => onOpenLead?.(lead)}
                  className={cn(
                    'lead-detail-deal-card',
                    leadLinkActive && 'ring-1 ring-white/20'
                  )}
                  aria-current={leadLinkActive ? 'true' : undefined}
                >
                  <User className="h-4 w-4 shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{leadName || 'Lead'}</div>
                    <div className="text-[11px] text-white/45 mt-0.5">View lead profile</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              ) : (
                <div className="lead-detail-deal-card opacity-70 pointer-events-none">
                  <User className="h-4 w-4 shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{leadName}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 lead-detail-columns-wrap">
            <div className="space-y-3">
              <section className="lead-detail-section">
                <DealDetailSectionTitle>Notes</DealDetailSectionTitle>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
                  onBlur={saveNotes}
                  disabled={readOnly || isClosed}
                  rows={4}
                  className="lead-detail-field w-full text-sm px-3 py-2 resize-none"
                  placeholder="Deal notes…"
                />
              </section>

              <section className="lead-detail-section">
                <DealDetailSectionTitle>Tags</DealDetailSectionTitle>
                <TagPicker
                  type="deals"
                  entity={d}
                  tagRegistry={tagRegistry}
                  getToken={getToken}
                  onRegistryChange={onRefreshTags}
                  disabled={readOnly || isClosed || !onDealUpdate}
                  hideWhenEmpty={false}
                  showAddTrigger={!readOnly && !isClosed && !!onDealUpdate}
                  inline
                  onTagsChange={({ tagIds, tagMeta }) => {
                    persist({ tagIds, tagMeta })
                  }}
                />
              </section>

              {(onOpenQuote || (!readOnly && !isClosed && onCreateQuoteForDeal)) && (
                <section className="lead-detail-section">
                  <DealDetailSectionTitle
                    action={
                      !readOnly && !isClosed && onCreateQuoteForDeal ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => onCreateQuoteForDeal({ deal: d, pipeline, lead })}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Create
                        </Button>
                      ) : null
                    }
                  >
                    Quotes
                  </DealDetailSectionTitle>
                  {dealQuotesLoading ? (
                    <div className="flex items-center gap-2 py-2 text-xs opacity-50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      Loading quotes…
                    </div>
                  ) : dealQuotes.length === 0 ? (
                    <p className="text-xs text-white/40 py-1">No quotes linked to this deal</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dealQuotes.map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            disabled={!onOpenQuote}
                            onClick={() => onOpenQuote?.(q)}
                            className="lead-detail-deal-card disabled:opacity-60 disabled:pointer-events-none"
                          >
                            <QuoteIcon className="h-4 w-4 shrink-0 opacity-50" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{q.title || 'Quote'}</div>
                              <div className="text-[11px] text-white/45 flex gap-2 flex-wrap items-center mt-0.5">
                                <QuoteStatusBadge status={q.status} />
                                {canSeeDealAmounts && (
                                  <span className="tabular-nums">{formatQuoteMoney(q.total)}</span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>

            <div className="space-y-3">
              {canSeeDealAmounts && (
                <DealFinancesPanel
                  payments={payments}
                  costs={costs}
                  onPaymentsChange={handlePaymentsChange}
                  onCostsChange={handleCostsChange}
                  onPaymentsCommit={handlePaymentsBlur}
                  onCostsCommit={handleCostsBlur}
                  readOnly={readOnly || isClosed}
                  canSeeDealAmounts={canSeeDealAmounts}
                />
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

              <section className="lead-detail-section">
                <DealDetailSectionTitle
                  action={
                    !readOnly && !isClosed ? (
                      <>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={uploading || dealStorageFull}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                            </>
                          )}
                        </Button>
                      </>
                    ) : null
                  }
                >
                  Files
                </DealDetailSectionTitle>
                <StorageUsageBar
                  usedBytes={dealFilesUsed}
                  limitBytes={DEAL_STORAGE_LIMIT_BYTES}
                  className="mb-2"
                  label="Deal storage"
                />
                <ul className="space-y-1.5">
                  {(d.files || []).length === 0 && (
                    <li className="text-xs text-white/40 py-1">No files</li>
                  )}
                  {(d.files || []).map((f, fileIndex) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 py-2 px-2.5 rounded-lg border border-white/10 bg-white/[0.04]"
                    >
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center gap-2 text-left hover:opacity-90"
                        onClick={() => setPreviewFileIndex(fileIndex)}
                        title="Preview file"
                      >
                        <FileText className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="flex-1 text-sm truncate">{f.name}</span>
                        <span className="text-[10px] text-white/40 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadDealFile(getToken, f.key, f.name)
                        }}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                      </button>
                      {!readOnly && !isClosed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteFile(f)
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 opacity-40 hover:opacity-80" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>

      <FilePreviewOverlay
        open={previewFileIndex != null}
        onClose={() => setPreviewFileIndex(null)}
        items={dealFilePreviewItems}
        initialIndex={previewFileIndex ?? 0}
      />

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
