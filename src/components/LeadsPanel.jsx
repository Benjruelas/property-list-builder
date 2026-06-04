import { useState, useMemo, useCallback } from 'react'
import { Search, UserSearch } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange } from './ui/panelDialogUtils'
import { LeadDetails } from './LeadDetails'
import { CreateLeadDialog } from './CreateLeadDialog'
import { CreateDealDialog } from './CreateDealDialog'
import { DealTemplatePickerDialog } from './DealTemplatePickerDialog'
import { displayLeadName, formatLeadAddress, updateLead } from '@/utils/leads'
import { templateToCreateDealPrefill } from '@/utils/dealTemplates'
import { cn } from '@/lib/utils'
import { findDealsForLead } from '@/utils/deals'
import { showToast } from './ui/toast'
import { LeadRow } from './LeadRow'

export function LeadsPanel({
  isOpen,
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
  createDealPipelines = [],
  createDealSaving = false,
  onCreateDealSubmit,
  pipelinesCount = 0,
  canSeeDealAmounts = true,
  onEditLead,
}) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [dealPickerOpen, setDealPickerOpen] = useState(false)
  const [pendingDealPrefill, setPendingDealPrefill] = useState(null)
  const [createDealOpen, setCreateDealOpen] = useState(false)
  const [createDealPrefill, setCreateDealPrefill] = useState(null)

  const selectedLead = useMemo(
    () => (detailLeadId ? leads.find((l) => l.id === detailLeadId || l.parcelId === detailLeadId) : null),
    [detailLeadId, leads],
  )

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim()
    const sorted = [...leads].sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    )
    if (!q) return sorted
    return sorted.filter((l) => {
      const name = displayLeadName(l).toLowerCase()
      return (
        name.includes(q) ||
        (l.address || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q)
      )
    })
  }, [leads, search])

  const dealCountByLead = useMemo(() => {
    const m = new Map()
    for (const l of leads) {
      m.set(l.id, findDealsForLead(pipelines, l.id).length)
    }
    return m
  }, [leads, pipelines])

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
    try {
      const saved = await updateLead(getToken, updated.id, updated)
      onLeadsChange?.(leads.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, leads, onLeadsChange])

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

  const handlePanelBack = () => {
    if (selectedLead) {
      onCloseLeadDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  return (
    <>
      <Dialog open={isOpen} modal={false} onOpenChange={(open) => handlePanelDialogOpenChange(open, hasNestedDetail, handlePanelBack)}>
        <DialogContent
          className={cn(
            'map-panel list-panel leads-panel fullscreen-panel flex flex-col min-h-0 p-0',
            hasNestedDetail && 'invisible pointer-events-none'
          )}
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

          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="relative mb-3">
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
            {leads.length === 0 ? (
              <div className="text-center py-16">
                <UserSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No leads yet.</p>
                <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a lead to track a property and contact. Add deals to pipes when you&apos;re ready to work the job.</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">No leads match your search.</p>
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  dealCount={dealCountByLead.get(lead.id) || 0}
                  onClick={(l) => onOpenLeadDetail?.(l.id)}
                />
              ))
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

      <LeadDetails
        isOpen={isOpen && !!selectedLead}
        instantDismiss={instantDismiss}
        onClose={() => onCloseLeadDetail?.()}
        lead={selectedLead}
        pipelines={pipelines}
        getToken={getToken}
        parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
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
      />
    </>
  )
}

export default LeadsPanel
