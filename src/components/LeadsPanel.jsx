import { useState, useMemo, useCallback, useRef } from 'react'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { FileUp, Search, UserSearch } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton, PanelOptionsButton } from './ui/panel-header'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss, useListDialogUnderDetail } from './ui/panelDialogUtils'
import { LeadDetails } from './LeadDetails'
import { CreateLeadDialog } from './CreateLeadDialog'
import { ImportLeadsDialog } from './ImportLeadsDialog'
import { CreateDealDialog } from './CreateDealDialog'
import { DealTemplatePickerDialog } from './DealTemplatePickerDialog'
import { FormTemplatePickerDialog } from './forms/FormTemplatePickerDialog'
import {
  displayLeadName,
  formatLeadAddress,
  updateLead,
  toLeadPatchBody,
  isLeadPhotosOnlyPatch,
  mergeLeadDetail,
  mergeLeadDetailFromPhotoApi,
  upsertLeadInLocalStore,
  getLeadStatus,
  lastContactedAt,
  leadToParcelData,
} from '@/utils/leads'
import { filterByTags, buildFilterableTags } from '@/utils/tags'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { PanelSearchInput } from './ui/PanelSearchInput'
import { templateToCreateDealPrefill } from '@/utils/dealTemplates'
import { cn } from '@/lib/utils'
import { getLeadPhones, getLeadEmails, leadContactMatchesQuery } from '@/utils/leadContact'
import { buildDealCountByLeadId } from '@/utils/deals'
import {
  DEFAULT_NEW_LEAD_WINDOW,
  isCreatedWithinDays,
  newLeadWindowLabel,
  nextNewLeadWindow,
} from '@/utils/leadTimeWindows'
import { showToast } from './ui/toast'
import { LeadRow } from './LeadRow'
import { PanelListBodyLoading } from './ui/PanelListLoadingShell'
import { useWindowedList } from '@/hooks/useWindowedList'

const LEADS_PANEL_MENU_W = 180

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
  dealsDetailDealId = null,
  dealsLeadOverlayId = null,
  reportsDetailOverLead = false,
  formsFillOverLead = false,
  onOpenLeadDetail,
  onCloseLeadDetail,
  onOpenFormFillFromLead,
  onOpenFormEditFromLead,
  onLeadFormSent,
  currentUserId = null,
  currentUser = null,
  canAccessPhotos = true,
  canAccessReports = true,
  canAccessForms = true,
  onCreatePhotoReport,
  onOpenPhotoReport,
  onCreateLeadForm,
  onOpenLeadForm,
  leadFormsRefreshEpoch = 0,
  leadReportsRefreshEpoch = 0,
  createDealPipelines = [],
  createDealSaving = false,
  onCreateDealSubmit,
  pipelinesCount = 0,
  canSeeDealAmounts = true,
  onEditLead,
  onLeadDeleted,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
  leadStatuses = [],
  leadCustomFields = [],
  dealCustomFields = [],
  leadsDetailTopLayer = false,
  isLeadsDetailStandalone = false,
  editLeadId = null,
  leadContactActionOpen = false,
}) {
  const [search, setSearch] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [statusFilter, setStatusFilter] = useState(null)
  const [sortMode, setSortMode] = useState('recent')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [leadsMenuOpen, setLeadsMenuOpen] = useState(false)
  const leadsMenuTriggerRef = useRef(null)
  const [dealPickerOpen, setDealPickerOpen] = useState(false)
  const [pendingDealPrefill, setPendingDealPrefill] = useState(null)
  const [createDealOpen, setCreateDealOpen] = useState(false)
  const [createDealPrefill, setCreateDealPrefill] = useState(null)
  const [leadFormPickerOpen, setLeadFormPickerOpen] = useState(false)
  const [leadFormPickerLeadId, setLeadFormPickerLeadId] = useState(null)
  const [newLeadWindowDays, setNewLeadWindowDays] = useState(DEFAULT_NEW_LEAD_WINDOW)

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
    for (const s of leadStatuses) counts[s.id] = 0
    let inPipeline = 0
    let needsFollowUp = 0
    let newInWindow = 0
    const now = new Date()

    for (const l of leads) {
      const dealCount = dealCountByLead.get(l.id) || 0
      const st = getLeadStatus(l, dealCount, leadStatuses)
      if (counts[st] !== undefined) counts[st]++
      const active = st !== 'converted' && st !== 'lost'
      if (active) {
        inPipeline++
        if (!lastContactedAt(l)) needsFollowUp++
      }
      if (isCreatedWithinDays(l.createdAt, newLeadWindowDays, now)) newInWindow++
    }

    return { counts, inPipeline, needsFollowUp, newInWindow }
  }, [leads, dealCountByLead, leadStatuses, newLeadWindowDays])

  const statusCounts = leadAnalytics.counts

  const hasActiveFilters = !!(search.trim() || statusFilter || selectedTagIds.length > 0 || sortMode !== 'recent')

  const filterTags = useMemo(
    () => buildFilterableTags('leads', tagRegistry, leads),
    [tagRegistry, leads],
  )

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = [...leads]

    if (statusFilter) {
      list = list.filter((l) => getLeadStatus(l, dealCountByLead.get(l.id) || 0, leadStatuses) === statusFilter)
    }

    list = filterByTags(list, selectedTagIds)

    if (q) {
      list = list.filter((l) => {
        const name = displayLeadName(l).toLowerCase()
        return (
          name.includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          leadContactMatchesQuery(l, q)
        )
      })
    }

    if (sortMode === 'followup') {
      list.sort((a, b) => {
        const statusA = getLeadStatus(a, dealCountByLead.get(a.id) || 0, leadStatuses)
        const statusB = getLeadStatus(b, dealCountByLead.get(b.id) || 0, leadStatuses)
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
  }, [leads, search, selectedTagIds, statusFilter, sortMode, dealCountByLead, leadStatuses])

  // Windowed rendering — mounts ~80 rows at a time instead of the whole list.
  const { visibleItems: visibleLeads, sentinel: leadsSentinel } = useWindowedList(filteredLeads)

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

  const handleCreated = (lead) => {
    onRefreshLeads?.()
    onLeadsChange?.([...leads, lead])
  }

  const handleImported = useCallback((created) => {
    if (!created?.length) return
    onLeadsChange?.((prev) => {
      const list = Array.isArray(prev) ? prev : []
      const byId = new Map(list.map((l) => [l.id, l]))
      for (const lead of created) {
        if (lead?.id) byId.set(lead.id, lead)
      }
      return [...byId.values()]
    })
    onRefreshLeads?.()
  }, [onLeadsChange, onRefreshLeads])

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

  const startCreateLeadForm = useCallback((lead) => {
    if (!canAccessForms) {
      showToast('Forms are not available on your plan', 'warning')
      return
    }
    if (!lead?.id) return
    setLeadFormPickerLeadId(lead.id)
    setLeadFormPickerOpen(true)
  }, [canAccessForms])

  const handleFormTemplatePicked = useCallback((template, meta) => {
    if (!template?.id || !leadFormPickerLeadId) return
    if (meta?.isNew) {
      onOpenFormEditFromLead?.(template.id, leadFormPickerLeadId, { returnToFormPicker: true })
      return
    }
    setLeadFormPickerOpen(false)
    onOpenFormFillFromLead?.(template.id, leadFormPickerLeadId)
  }, [leadFormPickerLeadId, onOpenFormEditFromLead, onOpenFormFillFromLead])

  const showingLeadDetail = !!(detailLeadId && selectedLead)
  const showLeadDetailPanel = showingLeadDetail && !dealsDetailDealId && !dealsLeadOverlayId
  const stickyDetailLeadRef = useRef(null)
  if (selectedLead) stickyDetailLeadRef.current = selectedLead
  const leadForDetail = selectedLead || stickyDetailLeadRef.current
  // Report-from-lead navigation drops the leads list frame; keep lead detail open (obscured)
  // under the report — do not retain the list dialog or it becomes the visible panel.
  const { listDialogOpen, listObscuredByDetail } = useListDialogUnderDetail(
    isOpen && !reportsDetailOverLead && !formsFillOverLead,
    showingLeadDetail && !reportsDetailOverLead && !formsFillOverLead,
  )
  const leadDetailDialogOpen = !!leadForDetail && (showLeadDetailPanel || reportsDetailOverLead || formsFillOverLead)
  const hasNestedOverlay = showingLeadDetail || createOpen || importOpen || dealPickerOpen || createDealOpen || leadFormPickerOpen
  const listPanelRef = useRef(null)
  useObscuredPanelRoot(listPanelRef, listObscuredByDetail)

  const handlePanelBack = () => {
    if (selectedLead) {
      onCloseLeadDetail?.()
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
            'map-panel list-panel leads-panel fullscreen-panel flex flex-col min-h-0 p-0',
            listObscuredByDetail && 'crm-list-under-detail',
          )}
          panelDockSlot={listObscuredByDetail ? undefined : panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          instantDismiss={instantDismiss && !isOpen}
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-leads-panel-menu]')) e.preventDefault()
            if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Manage your leads</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Leads">
              <PanelCreateButton onClick={() => setCreateOpen(true)} title="Create lead" />
              <PanelOptionsButton
                ref={leadsMenuTriggerRef}
                title="Leads options"
                onClick={() => setLeadsMenuOpen(true)}
              />
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
                    <button
                      type="button"
                      className="leads-analytics-stat-value leads-analytics-stat-value-toggle"
                      onClick={() => setNewLeadWindowDays((days) => nextNewLeadWindow(days))}
                      aria-label={`New leads in last ${newLeadWindowDays} days, tap to change period`}
                      title={`Last ${newLeadWindowDays} days — tap to change`}
                    >
                      {leadAnalytics.newInWindow}
                    </button>
                    <div className="leads-analytics-stat-label">{newLeadWindowLabel(newLeadWindowDays)}</div>
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
              <PanelSearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads by name, address, phone, or email…"
                aria-label="Search leads"
              />
              <PanelFilterMenu
                tags={filterTags}
                selectedTagIds={selectedTagIds}
                onTagIdsChange={setSelectedTagIds}
                statusOptions={leadStatuses}
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
                <button
                  type="button"
                  className="mt-4 text-sm underline underline-offset-2 opacity-70"
                  onClick={() => setImportOpen(true)}
                >
                  Import CSV
                </button>
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
                  <span>Phone</span>
                  <span>Email</span>
                  <span>Activity</span>
                </div>
                {visibleLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    dealCount={dealCountByLead.get(lead.id) || 0}
                    tagRegistry={tagRegistry}
                    leadStatuses={leadStatuses}
                    currentUser={currentUser}
                    currentUserId={currentUserId}
                    onClick={(l) => {
                    document.activeElement?.blur?.()
                    onOpenLeadDetail?.(l.id)
                  }}
                  />
                ))}
                {leadsSentinel}
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

      <OptionsMenuDropdown
        open={leadsMenuOpen}
        onClose={() => setLeadsMenuOpen(false)}
        triggerRef={leadsMenuTriggerRef}
        menuWidth={LEADS_PANEL_MENU_W}
        dataAttr="data-leads-panel-menu"
      >
        <OptionsMenuItem onClick={() => { setLeadsMenuOpen(false); setImportOpen(true) }}>
          <FileUp className="h-4 w-4 flex-shrink-0" />
          Import CSV
        </OptionsMenuItem>
      </OptionsMenuDropdown>

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={(v) => { if (!v) setImportOpen(false) }}
        getToken={getToken}
        existingLeads={leads}
        leadStatuses={leadStatuses}
        leadCustomFields={leadCustomFields}
        tagRegistry={tagRegistry}
        teams={teams}
        teamMembership={teamMembership}
        onImported={handleImported}
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

      <FormTemplatePickerDialog
        open={leadFormPickerOpen}
        onOpenChange={(v) => {
          setLeadFormPickerOpen(v)
          if (!v) setLeadFormPickerLeadId(null)
        }}
        getToken={getToken}
        onSelect={handleFormTemplatePicked}
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
        dealCustomFields={dealCustomFields}
      />

      {leadForDetail ? (
          <LeadDetails
            isOpen={leadDetailDialogOpen}
            instantDismiss={instantDismiss}
            panelDockSlot={panelDockSlot}
            nestedOverlay={false}
            topLayer={leadsDetailTopLayer}
            primaryDetail={isLeadsDetailStandalone}
            obscuredByChild={reportsDetailOverLead || formsFillOverLead}
            obscuredByContactAction={leadContactActionOpen}
            externalNestedOverlay={
              (!!editLeadId && editLeadId === leadForDetail?.id)
              || createDealOpen
              || dealPickerOpen
              || leadFormPickerOpen
              || reportsDetailOverLead
              || formsFillOverLead
              || leadContactActionOpen
            }
            onClose={() => onCloseLeadDetail?.()}
            lead={leadForDetail}
            pipelines={pipelines}
            getToken={getToken}
            parcelData={leadToParcelData(leadForDetail)}
            onOpenParcelDetails={onOpenParcelDetails}
            onEmailClick={onEmailClick}
            onPhoneClick={onPhoneClick}
            onTextClick={onTextClick}
            onGoToParcelOnMap={onGoToParcelOnMap}
            onLeadUpdate={handleLeadUpdate}
            onEditLead={onEditLead}
            onCreateDeal={onCreateDeal ?? startCreateDeal}
            onOpenDeal={onOpenDeal}
            onLeadDeleted={onLeadDeleted}
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
            canAccessForms={canAccessForms}
            onCreateLeadForm={onCreateLeadForm ?? startCreateLeadForm}
            onOpenLeadForm={onOpenLeadForm}
            leadFormsRefreshEpoch={leadFormsRefreshEpoch}
            leadReportsRefreshEpoch={leadReportsRefreshEpoch}
            tagRegistry={tagRegistry}
            onRefreshTags={onRefreshTags}
            leadStatuses={leadStatuses}
            leadCustomFields={leadCustomFields}
          />
      ) : null}
    </>
  )
}

export default LeadsPanel
