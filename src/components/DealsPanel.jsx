import { useState, useMemo, useCallback, useRef } from 'react'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { Search, Briefcase, ChevronDown, ChevronRight, Archive, Plus } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton, PanelOptionsButton } from './ui/panel-header'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss, mapListDialogOpen, listPanelObscuredByDetail } from './ui/panelDialogUtils'
import { cn } from '@/lib/utils'
import { flattenDealsFromPipelines } from '@/utils/deals'
import { aggregateDealFinancials, formatDealMoney } from '@/utils/dealFinances'
import { profitValueClass } from './DealLineItemsSection'
import { DealRow, ClosedDealRow } from './DealRow'
import { DealDetails } from './DealDetails'
import { LeadDetails } from './LeadDetails'
import { CreateDealDialog } from './CreateDealDialog'
import { DealTemplatePickerDialog } from './DealTemplatePickerDialog'
import { updateLead, toLeadPatchBody, isLeadPhotosOnlyPatch, mergeLeadDetail, mergeLeadDetailFromPhotoApi, upsertLeadInLocalStore } from '@/utils/leads'
import { templateToCreateDealPrefill } from '@/utils/dealTemplates'
import { loadClosedDeals } from '@/utils/closedDeals'
import { filterByTags, buildFilterableTags } from '@/utils/tags'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { showToast } from './ui/toast'
import { PanelListBodyLoading } from './ui/PanelListLoadingShell'
import { useWindowedList } from '@/hooks/useWindowedList'

import { leadToParcelData } from '@/utils/leads'
const DEALS_PANEL_MENU_W = 220

const STUCK_IN_STAGE_MS = 7 * 24 * 60 * 60 * 1000

function msInCurrentStage(deal) {
  if (!deal) return 0
  const cum = deal.cumulativeTimeByStatus || {}
  const cumMs = typeof cum[deal.status] === 'number' && Number.isFinite(cum[deal.status])
    ? cum[deal.status]
    : 0
  const entered = deal.statusEnteredAt ?? deal.createdAt
  const ts = entered != null && typeof entered === 'number' && Number.isFinite(entered) ? entered : null
  const currentStintMs = ts != null && ts > 0 ? Math.max(0, Date.now() - ts) : 0
  return cumMs + currentStintMs
}

function isFirstStage(deal, columns) {
  const firstId = columns?.[0]?.id
  return !!(firstId && deal.status === firstId)
}

export function DealsPanel({
  isOpen,
  retainDuringSwap = false,
  panelDockSlot,
  loading = false,
  instantDismiss = false,
  onClose,
  onBack,
  pipelines = [],
  leads = [],
  closedDeals: closedDealsProp,
  onDealUpdate,
  onRequestMoveDeal,
  onRequestCloseDeal,
  onRequestRemoveDeal,
  onCreateDeal,
  onCreateDealTemplate,
  onManageDealTemplates,
  getToken,
  teams = [],
  teamMembership = null,
  onPipelinesChange,
  onOpenScheduleAtDate,
  onLeadsChange,
  onRefreshLeads,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onTextClick,
  onGoToParcelOnMap,
  currentUserId = null,
  currentUser = null,
  onCreateQuoteForDeal,
  onOpenQuoteFromDeal,
  quotesRefreshKey = 0,
  dealsDetailDealId = null,
  dealsDetailPipelineId = null,
  dealsDetailReturnToPipes = false,
  dealsClosedRecordId = null,
  dealsLeadOverlayId = null,
  leadsDetailLeadId = null,
  onOpenDealDetail,
  onOpenDealFromLead,
  onOpenClosedDeal,
  onOpenLeadOverlay,
  onCloseDealDetail,
  onCloseLeadOverlay,
  onCloseClosedDeal,
  createDealPipelines = [],
  createDealSaving = false,
  onCreateDealSubmit,
  pipelinesCount = 0,
  canSeeDealAmounts = true,
  canAccessPhotos = true,
  onEditLead,
  onLeadDeleted,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
  leadOverlayPanelDockSlot,
  leadStatuses = [],
  isDealsDetailStandalone = false,
  editLeadId = null,
}) {
  const [search, setSearch] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [tab, setTab] = useState('active')
  const [collapsedPipelines, setCollapsedPipelines] = useState({})
  const [dealsMenuOpen, setDealsMenuOpen] = useState(false)
  const dealsMenuTriggerRef = useRef(null)
  const [dealPickerOpen, setDealPickerOpen] = useState(false)
  const [pendingDealPrefill, setPendingDealPrefill] = useState(null)
  const [createDealOpen, setCreateDealOpen] = useState(false)
  const [createDealPrefill, setCreateDealPrefill] = useState(null)

  const closedDeals = closedDealsProp ?? loadClosedDeals()

  const selectedDeal = useMemo(() => {
    if (!dealsDetailDealId) return null
    for (const p of pipelines) {
      const deal = (p.deals || []).find((d) => d.id === dealsDetailDealId)
      if (deal) return deal
    }
    return null
  }, [dealsDetailDealId, pipelines])

  const selectedPipelineId = dealsDetailPipelineId ?? (selectedDeal ? pipelines.find((p) => (p.deals || []).some((d) => d.id === selectedDeal.id))?.id : null)

  const selectedClosed = useMemo(
    () => (dealsClosedRecordId ? closedDeals.find((r) => r.id === dealsClosedRecordId) : null),
    [dealsClosedRecordId, closedDeals],
  )

  const leadOverlayId = dealsLeadOverlayId

  const allPipelineData = useMemo(() => {
    return pipelines.map((p) => ({
      id: p.id,
      title: p.title || 'Pipes',
      columns: p.columns || [],
      deals: p.deals || [],
    }))
  }, [pipelines])

  const totalDeals = useMemo(() => allPipelineData.reduce((s, p) => s + p.deals.length, 0), [allPipelineData])

  const visibleDealsForTags = useMemo(() => {
    const active = allPipelineData.flatMap((p) => p.deals || [])
    const closed = closedDeals.map((r) => r.deal).filter(Boolean)
    return [...active, ...closed]
  }, [allPipelineData, closedDeals])

  const filterTags = useMemo(
    () => buildFilterableTags('deals', tagRegistry, visibleDealsForTags),
    [tagRegistry, visibleDealsForTags],
  )

  const filteredPipelines = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allPipelineData.map((p) => {
      let deals = [...p.deals].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      deals = filterByTags(deals, selectedTagIds)
      if (q) {
        deals = deals.filter((d) =>
          (d.title || '').toLowerCase().includes(q) ||
          (d.leadName || '').toLowerCase().includes(q) ||
          (d.leadAddress || '').toLowerCase().includes(q)
        )
      }
      return { ...p, deals }
    }).filter((p) => p.deals.length > 0 || (!search.trim() && selectedTagIds.length === 0))
  }, [allPipelineData, search, selectedTagIds])

  const filteredClosed = useMemo(() => {
    const q = search.toLowerCase().trim()
    let sorted = [...closedDeals].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    sorted = filterByTags(
      sorted.map((r) => ({ ...r, tagIds: r.deal?.tagIds || [] })),
      selectedTagIds
    )
    if (!q) return sorted
    return sorted.filter((r) =>
      (r.deal?.title || '').toLowerCase().includes(q) ||
      (r.deal?.leadAddress || '').toLowerCase().includes(q) ||
      (r.closedFrom?.title || '').toLowerCase().includes(q)
    )
  }, [closedDeals, search, selectedTagIds])

  const toggleCollapse = (pid) => setCollapsedPipelines((prev) => ({ ...prev, [pid]: !prev[pid] }))

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  // Flatten pipeline groups into one row stream (header rows + deal rows) so
  // long boards window across group boundaries instead of mounting every row.
  const activeRowStream = useMemo(() => {
    const rows = []
    const showHeader = allPipelineData.length > 1
    for (const pipeline of filteredPipelines) {
      if (pipeline.deals.length === 0) continue
      const collapsed = collapsedPipelines[pipeline.id]
      if (showHeader) rows.push({ type: 'header', pipeline, collapsed, key: `hdr-${pipeline.id}` })
      if (!collapsed) {
        for (const deal of pipeline.deals) {
          rows.push({ type: 'deal', deal, pipeline, showHeader, key: deal.id })
        }
      }
    }
    return rows
  }, [filteredPipelines, collapsedPipelines, allPipelineData.length])

  const { visibleItems: visibleActiveRows, sentinel: activeSentinel } = useWindowedList(activeRowStream)
  const { visibleItems: visibleClosed, sentinel: closedSentinel } = useWindowedList(filteredClosed)

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)
  const selectedLead = selectedDeal?.leadId ? leads.find((l) => l.id === selectedDeal.leadId) : null
  const selectedClosedLead = useMemo(() => {
    if (!selectedClosed) return null
    const leadId = selectedClosed.leadId || selectedClosed.deal?.leadId
    if (leadId) {
      return leads.find((l) => l.id === leadId) || selectedClosed.lead || null
    }
    return selectedClosed.lead || null
  }, [selectedClosed, leads])
  const leadOverlay = leadOverlayId
    ? (leads.find((l) => l.id === leadOverlayId)
      || (selectedClosedLead?.id === leadOverlayId ? selectedClosedLead : null)
      || (selectedLead?.id === leadOverlayId ? selectedLead : null))
    : null

  const handleGoToParcelOnMap = useCallback((data) => {
    onCloseLeadOverlay?.()
    onCloseDealDetail?.()
    onGoToParcelOnMap?.(data)
  }, [onGoToParcelOnMap, onCloseLeadOverlay, onCloseDealDetail])

  const handleLeadUpdate = useCallback(async (updated, opts = {}) => {
    const payload = toLeadPatchBody(updated)
    const merge = isLeadPhotosOnlyPatch(payload) ? mergeLeadDetailFromPhotoApi : mergeLeadDetail
    onLeadsChange?.((prev) => upsertLeadInLocalStore(prev, updated, merge))
    if (opts.localOnly) return
    if (isLeadPhotosOnlyPatch(payload)) return
    try {
      const saved = await updateLead(getToken, updated.id, payload)
      onLeadsChange?.((prev) => upsertLeadInLocalStore(prev, saved))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, onLeadsChange])

  const openLeadFromDeal = useCallback((lead) => {
    if (!lead?.id) return
    if (leadOverlayId === lead.id) return
    // Leads → lead → deal: return to the existing lead detail instead of a second overlay.
    if (leadsDetailLeadId === lead.id) {
      if (leadOverlayId) onCloseLeadOverlay?.()
      onCloseDealDetail?.()
      return
    }
    onOpenLeadOverlay?.(lead.id)
  }, [leadOverlayId, leadsDetailLeadId, onOpenLeadOverlay, onCloseLeadOverlay, onCloseDealDetail])

  const isLeadLinkActive = useCallback((lead) => {
    if (!lead?.id) return false
    if (leadOverlayId === lead.id) return true
    return leadsDetailLeadId === lead.id && !!dealsDetailDealId && !leadOverlayId
  }, [leadOverlayId, leadsDetailLeadId, dealsDetailDealId])

  const handleDealUpdate = useCallback((updated) => {
    onDealUpdate?.(updated, selectedPipelineId)
  }, [onDealUpdate, selectedPipelineId])

  const handleCloseDealFromPanel = useCallback(async (deal, pipeline) => {
    const ok = await onRequestCloseDeal?.(deal, pipeline)
    if (ok) onCloseDealDetail?.()
  }, [onRequestCloseDeal, onCloseDealDetail])

  const handleRemoveDealFromPanel = useCallback(async (deal, pipeline) => {
    const ok = await onRequestRemoveDeal?.(deal, pipeline)
    if (ok) onCloseDealDetail?.()
  }, [onRequestRemoveDeal, onCloseDealDetail])

  const startCreateDeal = useCallback((prefill = null) => {
    if (pipelinesCount > 0 && createDealPipelines.length === 0) {
      showToast('Create or open a pipeline first', 'warning')
      return
    }
    setPendingDealPrefill(prefill)
    setDealPickerOpen(true)
  }, [pipelinesCount, createDealPipelines.length])

  const startCreateDealFromLead = useCallback((lead) => {
    if (!lead?.id) return
    startCreateDeal({ leadId: lead.id })
  }, [startCreateDeal])

  const handleDealTemplatePicked = useCallback((template) => {
    const pending = pendingDealPrefill || {}
    const merged = template ? templateToCreateDealPrefill(template, pending) : pending
    setCreateDealPrefill(merged)
    setCreateDealOpen(true)
    setDealPickerOpen(false)
    setPendingDealPrefill(null)
  }, [pendingDealPrefill])

  const handleCreateDealFormSubmit = useCallback(async (payload) => {
    await onCreateDealSubmit?.(payload)
    setCreateDealOpen(false)
    setCreateDealPrefill(null)
  }, [onCreateDealSubmit])

  const activeDealCount = useMemo(
    () => filteredPipelines.reduce((s, p) => s + p.deals.length, 0),
    [filteredPipelines]
  )

  const dealAnalytics = useMemo(() => {
    let stuck = 0
    let earlyStage = 0
    const activeDeals = []
    for (const p of allPipelineData) {
      for (const d of p.deals) {
        activeDeals.push(d)
        if (msInCurrentStage(d) >= STUCK_IN_STAGE_MS) stuck++
        if (isFirstStage(d, p.columns)) earlyStage++
      }
    }
    return {
      active: totalDeals,
      earlyStage,
      closed: closedDeals.length,
      stuck,
      activeFinancials: aggregateDealFinancials(activeDeals),
    }
  }, [allPipelineData, totalDeals, closedDeals])

  const showingActiveDeal = !!(dealsDetailDealId && !dealsDetailReturnToPipes && selectedDeal && selectedPipeline && !dealsClosedRecordId)
  const showingClosedDeal = !!(dealsClosedRecordId && selectedClosed && !dealsDetailDealId)
  const showingLeadOverlay = !!leadOverlay
  const showingPrimaryDetail = showingActiveDeal || showingClosedDeal || showingLeadOverlay
  const listOpenOpts = { showingDetail: showingPrimaryDetail, retainOpen: retainDuringSwap, swappingOut: retainDuringSwap }
  const listDialogOpen = mapListDialogOpen(isOpen, listOpenOpts)
  const listObscuredByDetail = listPanelObscuredByDetail(isOpen, showingPrimaryDetail, listOpenOpts)
  const hasNestedOverlay = showingPrimaryDetail || dealPickerOpen || createDealOpen
  const listPanelRef = useRef(null)
  useObscuredPanelRoot(listPanelRef, listObscuredByDetail)

  const handlePanelBack = () => {
    if (leadOverlayId) {
      onCloseLeadOverlay?.()
      return
    }
    if (selectedClosed) {
      onCloseClosedDeal?.()
      return
    }
    if (selectedDeal) {
      onCloseDealDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  return (
    <>
      <Dialog open={listDialogOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
        <DialogContent
          ref={listPanelRef}
          className={cn(
            'map-panel list-panel deals-panel fullscreen-panel flex flex-col min-h-0 p-0',
            listObscuredByDetail && 'crm-list-under-detail',
          )}
          panelDockSlot={panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          instantDismiss={instantDismiss && !isOpen}
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-deals-panel-menu]')) e.preventDefault()
            if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">All deals across pipelines</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Deals">
              <PanelCreateButton onClick={() => startCreateDeal()} title="Create deal" />
              <PanelOptionsButton
                ref={dealsMenuTriggerRef}
                title="Deals options"
                onClick={() => setDealsMenuOpen(true)}
              />
            </PanelHeader>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 min-h-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mb-3 space-y-2">
              {(totalDeals > 0 || closedDeals.length > 0) && (
                <div className="leads-analytics deals-analytics" aria-label="Deal summary">
                  <div className="leads-analytics-hero">
                    <div className="leads-analytics-hero-value">{dealAnalytics.stuck}</div>
                    <div className="leads-analytics-hero-copy">
                      <div className="leads-analytics-hero-label">Stuck in stage</div>
                      <div className="leads-analytics-hero-hint">
                        {dealAnalytics.stuck === 0
                          ? 'Every active deal moved within the last 7 days'
                          : 'Active deals in the same stage for 7+ days'}
                      </div>
                    </div>
                  </div>
                  <div className="deals-analytics-side">
                    <div className="leads-analytics-row" role="list">
                      <div className="leads-analytics-stat" role="listitem">
                        <div className="leads-analytics-stat-value">{dealAnalytics.active}</div>
                        <div className="leads-analytics-stat-label">Active</div>
                      </div>
                      <div className="leads-analytics-stat" role="listitem">
                        <div className="leads-analytics-stat-value">{dealAnalytics.earlyStage}</div>
                        <div className="leads-analytics-stat-label">Early stage</div>
                      </div>
                      <div className="leads-analytics-stat" role="listitem">
                        <div className="leads-analytics-stat-value">{dealAnalytics.closed}</div>
                        <div className="leads-analytics-stat-label">Closed</div>
                      </div>
                    </div>
                    {canSeeDealAmounts && (
                      <div className="leads-analytics-row leads-analytics-row--financial" role="list">
                        <div className="leads-analytics-stat" role="listitem">
                          <div
                            className={cn(
                              'leads-analytics-stat-value leads-analytics-stat-value--money',
                              profitValueClass(dealAnalytics.activeFinancials.profit)
                            )}
                          >
                            {formatDealMoney(dealAnalytics.activeFinancials.profit)}
                          </div>
                          <div className="leads-analytics-stat-label">Pipeline profit</div>
                        </div>
                        <div className="leads-analytics-stat" role="listitem">
                          <div className="leads-analytics-stat-value leads-analytics-stat-value--money">
                            {formatDealMoney(dealAnalytics.activeFinancials.collected)}
                          </div>
                          <div className="leads-analytics-stat-label">Collected</div>
                        </div>
                        <div className="leads-analytics-stat" role="listitem">
                          <div className="leads-analytics-stat-value leads-analytics-stat-value--money">
                            {formatDealMoney(dealAnalytics.activeFinancials.outstanding)}
                          </div>
                          <div className="leads-analytics-stat-label">Outstanding</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setTab('active')}
                  className={cn(
                    'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
                    tab === 'active' ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
                  )}
                >
                  Active <span className="text-xs opacity-60 ml-1">{totalDeals}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('closed')}
                  className={cn(
                    'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
                    tab === 'closed' ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
                  )}
                >
                  Closed <span className="text-xs opacity-60 ml-1">{closedDeals.length}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search deals by title, lead, or pipe…"
                    className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                    aria-label="Search deals"
                  />
                </div>
                <PanelFilterMenu
                  tags={filterTags}
                  selectedTagIds={selectedTagIds}
                  onTagIdsChange={setSelectedTagIds}
                />
              </div>
            </div>
            {loading ? (
              <PanelListBodyLoading />
            ) : tab === 'active' ? (
              totalDeals === 0 ? (
                <div className="text-center py-16">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No active deals yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a lead, then add a deal to a pipe to start tracking work.</p>
                </div>
              ) : activeDealCount === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">
                    {selectedTagIds.length > 0 ? 'No deals match the selected tags.' : 'No deals match your search.'}
                  </p>
                </div>
              ) : (
                <div className="crm-list-rows">
                  <div className="crm-column-headers crm-deal-headers" aria-hidden>
                    <span>Deal</span>
                    <span>Tags</span>
                    <span>Stage</span>
                    <span>Lead</span>
                    <span>Property</span>
                    <span>Phone</span>
                    <span>Email</span>
                    <span>In stage</span>
                    <span>Amount</span>
                  </div>
                  {visibleActiveRows.map((row) => (
                    row.type === 'header' ? (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => toggleCollapse(row.pipeline.id)}
                        className="w-full flex items-center gap-2 py-2 text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
                      >
                        {row.collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{row.pipeline.title}</span>
                        <span className="text-xs opacity-50 ml-auto shrink-0">{row.pipeline.deals.length}</span>
                      </button>
                    ) : (
                      <DealRow
                        key={row.key}
                        deal={row.deal}
                        columns={row.pipeline.columns}
                        pipelineTitle={row.showHeader ? row.pipeline.title : null}
                        lead={row.deal.leadId ? leadsById.get(row.deal.leadId) || null : null}
                        onClick={(d) => onOpenDealDetail?.(d.id, row.pipeline.id)}
                        canSeeDealAmounts={canSeeDealAmounts}
                        tagRegistry={tagRegistry}
                      />
                    )
                  ))}
                  {activeSentinel}
                </div>
              )
            ) : filteredClosed.length === 0 ? (
              <div className="text-center py-16">
                {closedDeals.length === 0 ? (
                  <>
                    <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm opacity-60">No closed deals yet.</p>
                    <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Closed deals will appear here for reference.</p>
                  </>
                ) : (
                  <>
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm opacity-60">
                      {selectedTagIds.length > 0 ? 'No closed deals match the selected tags.' : 'No closed deals match your search.'}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="crm-list-rows">
                <div className="crm-column-headers crm-deal-headers" aria-hidden>
                  <span>Deal</span>
                  <span>Tags</span>
                  <span>Status</span>
                  <span>Lead</span>
                  <span>Property</span>
                  <span>Phone</span>
                  <span>Email</span>
                  <span>Closed</span>
                  <span>Amount</span>
                </div>
                {visibleClosed.map((r) => (
                  <ClosedDealRow key={r.id} record={r} onClick={(r) => onOpenClosedDeal?.(r.id)} canSeeDealAmounts={canSeeDealAmounts} tagRegistry={tagRegistry} />
                ))}
                {closedSentinel}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OptionsMenuDropdown
        open={dealsMenuOpen}
        onClose={() => setDealsMenuOpen(false)}
        triggerRef={dealsMenuTriggerRef}
        menuWidth={DEALS_PANEL_MENU_W}
        dataAttr="data-deals-panel-menu"
      >
        <OptionsMenuItem onClick={() => { setDealsMenuOpen(false); onCreateDealTemplate?.() }}>
          <Plus className="h-4 w-4 flex-shrink-0" />
          Create deal template
        </OptionsMenuItem>
        <OptionsMenuItem onClick={() => { setDealsMenuOpen(false); onManageDealTemplates?.() }}>
          <Briefcase className="h-4 w-4 flex-shrink-0" />
          Manage deal templates
        </OptionsMenuItem>
      </OptionsMenuDropdown>

      <DealTemplatePickerDialog
        open={dealPickerOpen}
        onOpenChange={(v) => {
          setDealPickerOpen(v)
          if (!v) setPendingDealPrefill(null)
        }}
        onSelect={handleDealTemplatePicked}
        nestedOverlay
      />

      <CreateDealDialog
        open={createDealOpen}
        onOpenChange={(v) => {
          setCreateDealOpen(v)
          if (!v) setCreateDealPrefill(null)
        }}
        prefill={createDealPrefill}
        leads={leads}
        pipelines={createDealPipelines}
        teams={teams}
        saving={createDealSaving}
        onSubmit={handleCreateDealFormSubmit}
        nestedOverlay
        canSeeDealAmounts={canSeeDealAmounts}
      />

      {selectedDeal && selectedPipeline && dealsDetailDealId && !dealsClosedRecordId && (
        <DealDetails
          obscuredByChild={!!leadOverlayId && showingLeadOverlay}
          panelDockSlot={panelDockSlot}
          nestedOverlay={false}
          topLayer
          primaryDetail={isDealsDetailStandalone}
          hideOverlay
          suppressBackdrop
          deal={selectedDeal}
          pipeline={selectedPipeline}
          lead={selectedLead}
          pipelines={pipelines}
          leads={leads}
          teams={teams}
          onPipelinesChange={onPipelinesChange}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onClose={() => onCloseDealDetail?.()}
          onDealUpdate={handleDealUpdate}
          onOpenLead={openLeadFromDeal}
          leadLinkActive={isLeadLinkActive(selectedLead)}
          onRequestMoveDeal={onRequestMoveDeal}
          onRequestCloseDeal={handleCloseDealFromPanel}
          onRequestRemoveDeal={handleRemoveDealFromPanel}
          getToken={getToken}
          onCreateQuoteForDeal={onCreateQuoteForDeal}
          onOpenQuote={onOpenQuoteFromDeal}
          quotesRefreshKey={quotesRefreshKey}
          canSeeDealAmounts={canSeeDealAmounts}
          tagRegistry={tagRegistry}
          onRefreshTags={onRefreshTags}
          visibleDealsForTags={visibleDealsForTags}
          currentUser={currentUser || (currentUserId ? { uid: currentUserId } : null)}
          canAccessPhotos={canAccessPhotos}
        />
      )}

      {leadOverlay && (
        <LeadDetails
          isOpen
          instantDismiss={instantDismiss}
          panelDockSlot={leadOverlayPanelDockSlot}
          nestedOverlay
          topLayer
          stackedOverlay
          externalNestedOverlay={!!editLeadId && editLeadId === leadOverlay?.id}
          onClose={() => onCloseLeadOverlay?.()}
          lead={leadOverlay}
          pipelines={pipelines}
          getToken={getToken}
          parcelData={leadToParcelData(leadOverlay)}
          onOpenParcelDetails={onOpenParcelDetails}
          onEmailClick={onEmailClick}
          onPhoneClick={onPhoneClick}
          onTextClick={onTextClick}
          onGoToParcelOnMap={handleGoToParcelOnMap}
          onLeadUpdate={handleLeadUpdate}
          onCreateDeal={startCreateDealFromLead}
          onOpenDeal={(deal, pipelineId) => {
            onCloseLeadOverlay?.()
            onOpenDealFromLead?.(deal.id, pipelineId || deal.__pipelineId || selectedPipelineId)
          }}
          onLeadDeleted={onLeadDeleted}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onPipelinesChange={onPipelinesChange}
          teams={teams}
          teamMembership={teamMembership}
          leads={leads}
          canSeeDealAmounts={canSeeDealAmounts}
          currentUserId={currentUserId}
          onEditLead={onEditLead}
          tagRegistry={tagRegistry}
          onRefreshTags={onRefreshTags}
          leadStatuses={leadStatuses}
        />
      )}

      {selectedClosed && dealsClosedRecordId && !dealsDetailDealId && (
        <DealDetails
          obscuredByChild={!!leadOverlayId && showingLeadOverlay}
          panelDockSlot={panelDockSlot}
          nestedOverlay={false}
          topLayer
          primaryDetail={isDealsDetailStandalone}
          hideOverlay
          suppressBackdrop
          deal={selectedClosed.deal}
          pipeline={{ columns: selectedClosed.closedFrom?.columns, id: selectedClosed.closedFrom?.id, title: selectedClosed.closedFrom?.title }}
          lead={selectedClosedLead}
          pipelines={pipelines}
          leads={leads}
          closedRecord={selectedClosed}
          readOnly
          onClose={() => onCloseClosedDeal?.()}
          onOpenLead={openLeadFromDeal}
          leadLinkActive={isLeadLinkActive(selectedClosedLead)}
          getToken={getToken}
          onOpenQuote={onOpenQuoteFromDeal}
          quotesRefreshKey={quotesRefreshKey}
          canSeeDealAmounts={canSeeDealAmounts}
          tagRegistry={tagRegistry}
          onRefreshTags={onRefreshTags}
          visibleDealsForTags={visibleDealsForTags}
          currentUser={currentUser || (currentUserId ? { uid: currentUserId } : null)}
          canAccessPhotos={canAccessPhotos}
        />
      )}
    </>
  )
}

export default DealsPanel
