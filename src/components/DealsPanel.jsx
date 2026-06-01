import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, Briefcase, ChevronDown, ChevronRight, Clock, Archive, Plus } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton, PanelOptionsButton } from './ui/panel-header'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { formatTimeInState } from '@/utils/dealPipeline'
import { displayLeadName } from '@/utils/leads'
import { flattenDealsFromPipelines } from '@/utils/deals'
import { DealDetails } from './DealDetails'
import { DealProfitBadge } from './DealLineItemsSection'
import { LeadDetails } from './LeadDetails'
import { updateLead } from '@/utils/leads'
import { loadClosedDeals } from '@/utils/closedDeals'
import { showToast } from './ui/toast'

function leadToParcelData(lead) {
  if (!lead) return null
  return {
    id: lead.parcelId,
    address: lead.address,
    properties: lead.properties || {
      OWNER_NAME: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      SITUS_ADDR: lead.address,
      LATITUDE: lead.lat,
      LONGITUDE: lead.lng,
    },
    lat: lead.lat,
    lng: lead.lng,
  }
}

const listRowClass =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

const DEALS_PANEL_MENU_W = 220

function DealCard({ deal, columns, pipelineTitle, lead, onClick }) {
  const stageName = getColumnName(deal.status, columns)
  const timeStr = formatTimeInState(deal)
  const leadName = lead ? displayLeadName(lead) : (deal.leadName || '')
  return (
    <div
      className={listRowClass}
      onClick={() => onClick?.(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(deal)}
    >
      <div className="text-sm font-medium truncate">{deal.title || 'Untitled deal'}</div>
      {leadName && (
        <div className="text-xs opacity-60 truncate">{leadName}</div>
      )}
      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] opacity-50">
        <span className="leads-stage-badge inline-flex items-center px-2 py-0.5 rounded-full font-medium">
          {stageName}
        </span>
        {timeStr && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />{timeStr}
          </span>
        )}
        {pipelineTitle && (
          <span className="truncate max-w-[140px]">{pipelineTitle}</span>
        )}
        <DealProfitBadge deal={deal} className="text-[11px] ml-auto" />
      </div>
    </div>
  )
}

function ClosedDealCard({ record, onClick }) {
  const d = record.deal
  const closedDate = record.closedAt
    ? new Date(record.closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const leadName = record.lead ? displayLeadName(record.lead) : (d?.leadName || '')
  return (
    <div className={listRowClass} onClick={() => onClick?.(record)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick?.(record)}>
      <div className="text-sm font-medium truncate">{d?.title || 'Deal'}</div>
      {leadName && <div className="text-xs opacity-60 truncate">{leadName}</div>}
      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] opacity-50">
        <span className="leads-stage-badge px-2 py-0.5 rounded-full">Closed</span>
        {closedDate && (
          <span className="inline-flex items-center gap-1">
            <Archive className="h-3 w-3" />{closedDate}
          </span>
        )}
        {record.closedFrom?.title && (
          <span className="truncate max-w-[140px]">{record.closedFrom.title}</span>
        )}
        <DealProfitBadge deal={d} className="text-[11px] ml-auto" />
      </div>
    </div>
  )
}

export function DealsPanel({
  isOpen,
  onClose,
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
  onGoToParcelOnMap,
  currentUserId = null,
  onCreateQuoteForDeal,
}) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('active')
  const [collapsedPipelines, setCollapsedPipelines] = useState({})
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [selectedPipelineId, setSelectedPipelineId] = useState(null)
  const [selectedClosed, setSelectedClosed] = useState(null)
  const [leadOverlayId, setLeadOverlayId] = useState(null)
  const [dealsMenuOpen, setDealsMenuOpen] = useState(false)
  const dealsMenuTriggerRef = useRef(null)

  const closedDeals = closedDealsProp ?? loadClosedDeals()

  const allPipelineData = useMemo(() => {
    return pipelines.map((p) => ({
      id: p.id,
      title: p.title || 'Pipes',
      columns: p.columns || [],
      deals: p.deals || [],
    }))
  }, [pipelines])

  const totalDeals = useMemo(() => allPipelineData.reduce((s, p) => s + p.deals.length, 0), [allPipelineData])

  const filteredPipelines = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allPipelineData.map((p) => {
      let deals = [...p.deals].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      if (q) {
        deals = deals.filter((d) =>
          (d.title || '').toLowerCase().includes(q) ||
          (d.leadName || '').toLowerCase().includes(q) ||
          (d.leadAddress || '').toLowerCase().includes(q)
        )
      }
      return { ...p, deals }
    }).filter((p) => p.deals.length > 0 || !search.trim())
  }, [allPipelineData, search])

  const filteredClosed = useMemo(() => {
    const q = search.toLowerCase().trim()
    const sorted = [...closedDeals].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    if (!q) return sorted
    return sorted.filter((r) =>
      (r.deal?.title || '').toLowerCase().includes(q) ||
      (r.deal?.leadAddress || '').toLowerCase().includes(q) ||
      (r.closedFrom?.title || '').toLowerCase().includes(q)
    )
  }, [closedDeals, search])

  const toggleCollapse = (pid) => setCollapsedPipelines((prev) => ({ ...prev, [pid]: !prev[pid] }))

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

  useEffect(() => {
    if (!selectedDeal) setLeadOverlayId(null)
  }, [selectedDeal?.id])

  const handleLeadUpdate = useCallback(async (updated) => {
    try {
      const saved = await updateLead(getToken, updated.id, updated)
      onLeadsChange?.(leads.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, leads, onLeadsChange])

  const openLeadFromDeal = useCallback((lead) => {
    if (!lead?.id) return
    if (leadOverlayId === lead.id) return
    setLeadOverlayId(lead.id)
  }, [leadOverlayId])

  const handleDealUpdate = useCallback((updated) => {
    setSelectedDeal(updated)
    onDealUpdate?.(updated, selectedPipelineId)
  }, [onDealUpdate, selectedPipelineId])

  const handleCloseDealFromPanel = useCallback(async (deal, pipeline) => {
    const ok = await onRequestCloseDeal?.(deal, pipeline)
    if (ok) {
      setSelectedDeal(null)
      setSelectedPipelineId(null)
      setLeadOverlayId(null)
    }
  }, [onRequestCloseDeal])

  const handleRemoveDealFromPanel = useCallback(async (deal, pipeline) => {
    const ok = await onRequestRemoveDeal?.(deal, pipeline)
    if (ok) {
      setSelectedDeal(null)
      setSelectedPipelineId(null)
      setLeadOverlayId(null)
    }
  }, [onRequestRemoveDeal])

  const activeDealCount = useMemo(
    () => filteredPipelines.reduce((s, p) => s + p.deals.length, 0),
    [filteredPipelines]
  )

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          setSelectedDeal(null)
          setSelectedPipelineId(null)
          setLeadOverlayId(null)
          onClose()
        }
      }}>
        <DialogContent
          className="map-panel list-panel deals-panel fullscreen-panel flex flex-col min-h-0 p-0"
          showCloseButton={false}
          hideOverlay
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-deals-panel-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'border-b-0 pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">All deals across pipelines</DialogDescription>
            <PanelHeader onBack={onClose} title="Deals">
              <PanelCreateButton onClick={() => onCreateDeal?.()} title="Create deal" />
              <PanelOptionsButton
                ref={dealsMenuTriggerRef}
                title="Deals options"
                onClick={() => setDealsMenuOpen(true)}
              />
            </PanelHeader>

            <div className="mt-2 space-y-2">
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

              <div className="relative">
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
            </div>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5 min-h-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {tab === 'active' ? (
              totalDeals === 0 ? (
                <div className="text-center py-16">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No active deals yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a lead, then add a deal to a pipe to start tracking work.</p>
                </div>
              ) : activeDealCount === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">No deals match your search.</p>
                </div>
              ) : (
                filteredPipelines.map((pipeline) => {
                  if (pipeline.deals.length === 0) return null
                  const collapsed = collapsedPipelines[pipeline.id]
                  const showHeader = allPipelineData.length > 1
                  return (
                    <div key={pipeline.id}>
                      {showHeader && (
                        <button
                          type="button"
                          onClick={() => toggleCollapse(pipeline.id)}
                          className="w-full flex items-center gap-2 py-2 text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
                        >
                          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{pipeline.title}</span>
                          <span className="text-xs opacity-50 ml-auto shrink-0">{pipeline.deals.length}</span>
                        </button>
                      )}
                      {!collapsed && (
                        <div className="space-y-1.5">
                          {pipeline.deals.map((deal) => (
                            <DealCard
                              key={deal.id}
                              deal={deal}
                              columns={pipeline.columns}
                              pipelineTitle={showHeader ? null : pipeline.title}
                              lead={deal.leadId ? leads.find((l) => l.id === deal.leadId) : null}
                              onClick={(d) => { setSelectedDeal(d); setSelectedPipelineId(pipeline.id) }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
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
                    <p className="text-sm opacity-60">No closed deals match your search.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredClosed.map((r) => (
                  <ClosedDealCard key={r.id} record={r} onClick={setSelectedClosed} />
                ))}
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

      {selectedDeal && selectedPipeline && (
        <DealDetails
          deal={selectedDeal}
          pipeline={selectedPipeline}
          lead={selectedLead}
          pipelines={pipelines}
          leads={leads}
          teams={teams}
          onPipelinesChange={onPipelinesChange}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onClose={() => { setSelectedDeal(null); setSelectedPipelineId(null); setLeadOverlayId(null) }}
          onDealUpdate={handleDealUpdate}
          onOpenLead={openLeadFromDeal}
          leadLinkActive={!!leadOverlayId && leadOverlayId === selectedLead?.id}
          onRequestMoveDeal={onRequestMoveDeal}
          onRequestCloseDeal={handleCloseDealFromPanel}
          onRequestRemoveDeal={handleRemoveDealFromPanel}
          getToken={getToken}
          onCreateQuoteForDeal={onCreateQuoteForDeal}
        />
      )}

      {leadOverlay && (
        <LeadDetails
          isOpen
          onClose={() => setLeadOverlayId(null)}
          lead={leadOverlay}
          pipelines={pipelines}
          getToken={getToken}
          parcelData={leadToParcelData(leadOverlay)}
          onOpenParcelDetails={onOpenParcelDetails}
          onEmailClick={onEmailClick}
          onPhoneClick={onPhoneClick}
          onGoToParcelOnMap={onGoToParcelOnMap}
          onLeadUpdate={handleLeadUpdate}
          onCreateDeal={onCreateDeal}
          onOpenDeal={(deal, pipelineId) => {
            setLeadOverlayId(null)
            setSelectedPipelineId(pipelineId || deal.__pipelineId || selectedPipelineId)
            setSelectedDeal(deal)
          }}
          onLeadDeleted={() => {
            setLeadOverlayId(null)
            onRefreshLeads?.()
          }}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onPipelinesChange={onPipelinesChange}
          teams={teams}
          teamMembership={teamMembership}
          leads={leads}
          nestedOverlay
          topLayer
          currentUserId={currentUserId}
        />
      )}

      {selectedClosed && (
        <DealDetails
          deal={selectedClosed.deal}
          pipeline={{ columns: selectedClosed.closedFrom?.columns, id: selectedClosed.closedFrom?.id, title: selectedClosed.closedFrom?.title }}
          lead={selectedClosedLead}
          pipelines={pipelines}
          leads={leads}
          closedRecord={selectedClosed}
          readOnly
          onClose={() => { setSelectedClosed(null); setLeadOverlayId(null) }}
          onOpenLead={openLeadFromDeal}
          leadLinkActive={!!leadOverlayId && leadOverlayId === selectedClosedLead?.id}
          getToken={getToken}
        />
      )}
    </>
  )
}

export default DealsPanel
