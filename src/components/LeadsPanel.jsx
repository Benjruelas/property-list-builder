import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, UserSearch, Phone, Mail, Briefcase } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { LeadDetails } from './LeadDetails'
import { CreateLeadDialog } from './CreateLeadDialog'
import { displayLeadName, formatLeadAddress, updateLead } from '@/utils/leads'
import { cn } from '@/lib/utils'
import { VisibilityBadge } from './ResourceSharePicker'
import { findDealsForLead } from '@/utils/deals'
import { showToast } from './ui/toast'

const listRowClass =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

function LeadRow({ lead, dealCount, teams, onClick }) {
  const name = displayLeadName(lead)
  const address = formatLeadAddress(lead) || 'No address'
  return (
    <div
      className={listRowClass}
      onClick={() => onClick?.(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(lead)}
    >
      <div className="text-sm font-medium truncate">{name}</div>
      <div className="text-xs opacity-60 truncate" title={lead.address || undefined}>{address}</div>
      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] opacity-50">
        <VisibilityBadge resource={lead} className="normal-case tracking-normal" />
        {lead.phone && (
          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
        )}
        {lead.email && (
          <span className="inline-flex items-center gap-1 truncate max-w-[160px]"><Mail className="h-3 w-3" />{lead.email}</span>
        )}
        {dealCount > 0 && (
          <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{dealCount} deal{dealCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  )
}

export function LeadsPanel({
  isOpen,
  onClose,
  onBackToParent,
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
  focusLeadId = null,
  onFocusLeadHandled,
  currentUserId = null,
}) {
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editLead, setEditLead] = useState(null)

  useEffect(() => {
    if (!isOpen) setSelectedLead(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !focusLeadId) return
    const lead = leads.find((l) => l.id === focusLeadId || l.parcelId === focusLeadId)
    if (lead) setSelectedLead(lead)
    onFocusLeadHandled?.()
  }, [isOpen, focusLeadId, leads, onFocusLeadHandled])

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
      setSelectedLead(saved)
      onLeadsChange?.(leads.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, leads, onLeadsChange])

  const handleCreated = (lead) => {
    onRefreshLeads?.()
    onLeadsChange?.([...leads, lead])
  }

  const handleUpdated = (lead) => {
    onRefreshLeads?.()
    handleLeadUpdate(lead)
    setEditLead(null)
  }

  const handlePanelBack = () => {
    if (onBackToParent) {
      onBackToParent()
      return
    }
    onClose()
  }

  const handleDetailClose = () => {
    if (onBackToParent) {
      onBackToParent()
      return
    }
    setSelectedLead(null)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setSelectedLead(null); handlePanelBack() } }}>
        <DialogContent className="map-panel list-panel leads-panel fullscreen-panel flex flex-col min-h-0 p-0" showCloseButton={false} hideOverlay>
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Manage your leads</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Leads">
              <PanelCreateButton onClick={() => setCreateOpen(true)} title="Create lead" />
            </PanelHeader>

            <div className="relative mt-3">
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
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
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
                  teams={teams}
                  onClick={setSelectedLead}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateLeadDialog
        open={createOpen || !!editLead}
        onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditLead(null) } }}
        editLead={editLead}
        getToken={getToken}
        onResolveParcel={onResolveParcel}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
        existingLeads={leads}
        teams={teams}
        teamMembership={teamMembership}
        nestedOverlay
      />

      <LeadDetails
        isOpen={!!selectedLead}
        onClose={handleDetailClose}
        lead={selectedLead}
        pipelines={pipelines}
        getToken={getToken}
        parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
        onGoToParcelOnMap={onGoToParcelOnMap}
        onLeadUpdate={handleLeadUpdate}
        onEditLead={(l) => { setSelectedLead(null); setEditLead(l) }}
        onCreateDeal={onCreateDeal}
        onOpenDeal={onOpenDeal}
        onLeadDeleted={() => { setSelectedLead(null); onRefreshLeads?.() }}
        onOpenScheduleAtDate={onOpenScheduleAtDate}
        onPipelinesChange={onPipelinesChange}
        teams={teams}
        teamMembership={teamMembership}
        leads={leads}
        currentUserId={currentUserId}
      />
    </>
  )
}

export default LeadsPanel
