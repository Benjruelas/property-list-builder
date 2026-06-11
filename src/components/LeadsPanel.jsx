import { useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { Search, UserSearch } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'
const LeadDetails = lazy(() => import('./LeadDetails').then((m) => ({ default: m.LeadDetails })))
import { CreateLeadDialog } from './CreateLeadDialog'
import { CreateDealDialog } from './CreateDealDialog'
import { DealTemplatePickerDialog } from './DealTemplatePickerDialog'
import {
  displayLeadName,
  formatLeadAddress,
  updateLead,
  getLeadStatus,
  lastContactedAt,
  LEAD_STATUSES,
} from '@/utils/leads'
import { filterByTags } from '@/utils/tags'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { templateToCreateDealPrefill } from '@/utils/dealTemplates'
import { cn } from '@/lib/utils'
import { buildDealCountByLeadId } from '@/utils/deals'
import { showToast } from './ui/toast'
import { LeadRow } from './LeadRow'
import { PanelListBodyLoading } from './ui/PanelListLoadingShell'

export function LeadsPanel({
  isOpen,
  panelDockSlot,
  loading = false,
  instantDismiss = false,
  onClose,
  onBack,
  leads = [],
  pipelines = [],
  onLeadsChange,
  onRefreshLeads,
  getToken,
  onResolveParcel,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onTextClick,
  onGoToParcelOnMap,
  onCreateDeal,
  onOpenDeal,
  onOpenScheduleAtDate,
  onPipelinesChange,
  teams = [],
  teamMembership = null,
  detailLeadId = null,
  onOpenLeadDetail,
  onCloseLeadDetail,
  currentUserId = null,
  currentUser = null,
  canAccessPhotos = true,
  canAccessReports = true,
  onCreatePhotoReport,
  onOpenPhotoReport,
  createDealPipelines = [],
  createDealSaving = false,
  onCreateDealSubmit,
  pipelinesCount = 0,
  canSeeDealAmounts = true,
  onEditLead,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
}) {
  const [search, setSearch] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [statusFilter, setStatusFilter] = useState(null)
  const [sortMode, setSortMode] = useState('recent')
  const [createOpen, setCreateOpen] = useState(false)
  const [dealPickerOpen, setDealPickerOpen] = useState(false)
  const [pendingDealPrefill, setPendingDealPrefill] = useState(null)
  const [createDealOpen, setCreateDealOpen] = useState(false)
  const [createDealPrefill, setCreateDealPrefill] = useState(null)

  const selectedLead = useMemo(
    () => (detailLeadId ? leads.find((l) => l.id === detailLeadId || l.parcelId === detailLeadId) : null),
    [detailLeadId, leads],
  )

  const dealCountByLead = useMemo(
    () => buildDealCountByLeadId(pipelines),
    [pipelines],
  )

  const leadAnalytics = useMemo(() => {
    const counts = { all: leads.length }
    for (const s of LEAD_STATUSES) counts[s.id] = 0
    let inPipeline = 0
    let needsFollowUp = 0

    for (const l of leads) {
      const dealCount = dealCountByLead.get(l.id) || 0
      const st = getLeadStatus(l, dealCount)
      if (counts[st] !== undefined) counts[st]++
      const active = st === 'new' || st === 'contacted' || st === 'qualified'
      if (active) {
        inPipeline++
        if (!lastContactedAt(l)) needsFollowUp++
      }
    }

    return { counts, inPipeline, needsFollowUp }
  }, [leads, dealCountByLead])

  const statusCounts = leadAnalytics.counts

  const hasActiveFilters = !!(search.trim() || statusFilter || selectedTagIds.length > 0 || sortMode !== 'recent')

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = [...leads]

    if (statusFilter) {
      list = list.filter((l) => getLeadStatus(l, dealCountByLead.get(l.id) || 0) === statusFilter)
    }

    list = filterByTags(list, selectedTagIds)

    if (q) {
      list = list.filter((l) => {
        const name = displayLeadName(l).toLowerCase()
        return (
          name.includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          (l.phone || '').includes(q) ||
          (l.email || '').toLowerCase().includes(q)
        )
      })
    }

    if (sortMode === 'followup') {
      list.sort((a, b) => {
        const statusA = getLeadStatus(a, dealCountByLead.get(a.id) || 0)
        const statusB = getLeadStatus(b, dealCountByLead.get(b.id) || 0)
        const inactive = new Set(['converted', 'lost'])
        if (inactive.has(statusA) && !inactive.has(statusB)) return 1
        if (!inactive.has(statusA) && inactive.has(statusB)) return -1
        const contactA = lastContactedAt(a)
        const contactB = lastContactedAt(b)
        if (!contactA && !contactB) {
          return (a.createdAt || '').localeCompare(b.createdAt || '')
        }
        if (!contactA) return -1
        if (!contactB) return 1
        return contactA.localeCompare(contactB)
      })
    } else {
      list.sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
      )
    }

    return list
  }, [leads, search, selectedTagIds, statusFilter, sortMode, dealCountByLead])

  const leadToParcelData = (lead) => ({
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
  })

  const handleLeadUpdate = useCallback(async (updated) => {
    onLeadsChange?.((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
    try {
      const saved = await updateLead(getToken, updated.id, updated)
      onLeadsChange?.((prev) => prev.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, onLeadsChange])

  const handleCreated = (lead) => {
    onRefreshLeads?.()
    onLeadsChange?.([...leads, lead])
  }

  const startCreateDeal = useCallback((lead) => {
    if (!lead?.id) return
    if (pipelinesCount > 0 && createDealPipelines.length === 0) {
      showToast('Create or open a pipeline first', 'warning')
      return
    }
    setPendingDealPrefill({ leadId: lead.id })
    setDealPickerOpen(true)
  }, [pipelinesCount, createDealPipelines.length])

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

  const hasNestedDetail = !!detailLeadId
  const hasNestedOverlay = hasNestedDetail || createOpen || dealPickerOpen || createDealOpen
  const listPanelRef = useRef(null)
  useObscuredPanelRoot(listPanelRef, hasNestedDetail)

  const handlePanelBack = () => {
    if (selectedLead) {
      onCloseLeadDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  return (
    <>
      <Dialog open={isOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
        <DialogContent
          ref={listPanelRef}
          className={cn(
            'map-panel list-panel leads-panel fullscreen-panel flex flex-col min-h-0 p-0',
            hasNestedDetail && 'crm-panel-obscured'
          )}
          panelDockSlot={panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          instantDismiss={instantDismiss && !isOpen}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Manage your leads</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Leads">
              <PanelCreateButton onClick={() => setCreateOpen(true)} title="Create lead" />
            </PanelHeader>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 min-h-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {leads.length > 0 && (
              <div className="leads-analytics" aria-label="Lead summary">
                <div className="leads-analytics-hero">
                  <div className="leads-analytics-hero-value">{leadAnalytics.needsFollowUp}</div>
                  <div className="leads-analytics-hero-copy">
                    <div className="leads-analytics-hero-label">Need follow-up</div>
                    <div className="leads-analytics-hero-hint">
                      {leadAnalytics.needsFollowUp === 0
                        ? 'Every active lead has been contacted'
                        : 'Active leads with no call, text, or email logged'}
                    </div>
                  </div>
                </div>
                <div className="leads-analytics-row" role="list">
                  <div className="leads-analytics-stat" role="listitem">
                    <div className="leads-analytics-stat-value">{leadAnalytics.inPipeline}</div>
                    <div className="leads-analytics-stat-label">Active</div>
                  </div>
                  <div className="leads-analytics-stat" role="listitem">
                    <div className="leads-analytics-stat-value">{leadAnalytics.counts.new}</div>
                    <div className="leads-analytics-stat-label">New</div>
                  </div>
                  <div className="leads-analytics-stat" role="listitem">
                    <div className="leads-analytics-stat-value">{leadAnalytics.counts.converted}</div>
                    <div className="leads-analytics-stat-label">Converted</div>
                  </div>
                </div>
                <p className="leads-analytics-total">
                  {hasActiveFilters ? (
                    <>
                      Showing <strong>{filteredLeads.length}</strong> of <strong>{leadAnalytics.counts.all}</strong> leads
                    </>
                  ) : (
                    <>
                      <strong>{leadAnalytics.counts.all}</strong> lead{leadAnalytics.counts.all !== 1 ? 's' : ''} total
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads by name, address, phone, or email…"
                  className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                  aria-label="Search leads"
                />
              </div>
              <PanelFilterMenu
                tags={tagRegistry.leads || []}
                selectedTagIds={selectedTagIds}
                onTagIdsChange={setSelectedTagIds}
                statusOptions={LEAD_STATUSES}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                statusCounts={statusCounts}
                sortOptions={[
                  { id: 'recent', label: 'Recent' },
                  { id: 'followup', label: 'Needs follow-up' },
                ]}
                sortMode={sortMode}
                onSortModeChange={setSortMode}
                defaultSortMode="recent"
              />
            </div>
            {loading ? (
              <PanelListBodyLoading />
            ) : leads.length === 0 ? (
              <div className="text-center py-16">
                <UserSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No leads yet.</p>
                <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a lead to track a property and contact. Add deals to pipes when you&apos;re ready to work the job.</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">No leads match your filters.</p>
              </div>
            ) : (
              <div className="crm-list-rows">
                <div className="crm-column-headers crm-lead-headers" aria-hidden>
                  <span>Lead</span>
                  <span>Tags</span>
                  <span>Status</span>
                  <span>Property</span>
                  <span>Contact</span>
                  <span>Activity</span>
                </div>
                {filteredLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    dealCount={dealCountByLead.get(lead.id) || 0}
                    tagRegistry={tagRegistry}
                    onClick={(l) => {
                    document.activeElement?.blur?.()
                    onOpenLeadDetail?.(l.id)
                  }}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={(v) => { if (!v) setCreateOpen(false) }}
        getToken={getToken}
        onResolveParcel={onResolveParcel}
        onCreated={handleCreated}
        existingLeads={leads}
        teams={teams}
        teamMembership={teamMembership}
        nestedOverlay
      />

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

      {selectedLead ? (
        <Suspense fallback={null}>
          <LeadDetails
            isOpen={isOpen}
            instantDismiss={instantDismiss}
            onClose={() => onCloseLeadDetail?.()}
            lead={selectedLead}
            pipelines={pipelines}
            getToken={getToken}
            parcelData={leadToParcelData(selectedLead)}
            onOpenParcelDetails={onOpenParcelDetails}
            onEmailClick={onEmailClick}
            onPhoneClick={onPhoneClick}
            onTextClick={onTextClick}
            onGoToParcelOnMap={onGoToParcelOnMap}
            onLeadUpdate={handleLeadUpdate}
            onEditLead={onEditLead}
            onCreateDeal={onCreateDeal ?? startCreateDeal}
            onOpenDeal={onOpenDeal}
            onLeadDeleted={() => { onCloseLeadDetail?.(); onRefreshLeads?.() }}
            onOpenScheduleAtDate={onOpenScheduleAtDate}
            onPipelinesChange={onPipelinesChange}
            teams={teams}
            teamMembership={teamMembership}
            leads={leads}
            canSeeDealAmounts={canSeeDealAmounts}
            currentUserId={currentUserId}
            currentUser={currentUser}
            canAccessPhotos={canAccessPhotos}
            canAccessReports={canAccessReports}
            onCreatePhotoReport={onCreatePhotoReport}
            onOpenPhotoReport={onOpenPhotoReport}
            tagRegistry={tagRegistry}
            onRefreshTags={onRefreshTags}
          />
        </Suspense>
      ) : null}
    </>
  )
}

export default LeadsPanel
