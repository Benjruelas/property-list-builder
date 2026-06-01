import { useState, useEffect, useMemo, useRef } from 'react'
import { Phone, Mail, MapPin, Pencil, Trash2, Briefcase, ChevronRight, MoreVertical, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { PanelBackButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { DirectionsPicker } from './DirectionsPicker'
import { cn } from '@/lib/utils'
import { displayLeadName, formatLeadAddress, deleteLead, updateLead } from '@/utils/leads'
import { ResourceSharePicker, VisibilityBadge } from './ResourceSharePicker'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { findDealsForLead } from '@/utils/deals'
import { formatTimeInState } from '@/utils/dealPipeline'
import { LeadTasksSection } from './LeadTasksSection'
import { DealProfitBadge } from './DealLineItemsSection'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

const MENU_WIDTH = 180

/**
 * Lead-only detail panel — contact info, notes, linked deals.
 */
export function LeadDetails({
  isOpen,
  onClose,
  lead,
  pipelines = [],
  getToken,
  parcelData,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onGoToParcelOnMap,
  onLeadUpdate,
  onEditLead,
  onCreateDeal,
  onOpenDeal,
  onLeadDeleted,
  nestedOverlay = true,
  topLayer = false,
  teams = [],
  teamMembership = null,
  onPipelinesChange,
  onOpenScheduleAtDate,
  leads = [],
  taskListEpoch = 0,
  currentUserId = null,
}) {
  const activeTeam = teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
  const [savingShares, setSavingShares] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef(null)

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '')
      setNotesDirty(false)
      const norm = normalizeResourceVisibility(lead)
      setShareState({
        visibility: norm.visibility || VISIBILITY.PRIVATE,
        sharedMemberUids: norm.sharedMemberUids || [],
      })
    }
  }, [lead])

  useEffect(() => {
    setMenuOpen(false)
  }, [lead?.id, isOpen])

  const linkedDeals = useMemo(() => {
    if (!lead?.id) return []
    return findDealsForLead(pipelines, lead.id)
  }, [lead, pipelines])

  if (!isOpen || !lead) return null

  const name = displayLeadName(lead)
  const address = formatLeadAddress(lead)
  const isOwner = currentUserId && lead.ownerId === currentUserId
  const parcelLat = Number(lead.lat ?? parcelData?.lat ?? parcelData?.properties?.LATITUDE ?? parcelData?.properties?.latitude)
  const parcelLng = Number(lead.lng ?? parcelData?.lng ?? parcelData?.properties?.LONGITUDE ?? parcelData?.properties?.longitude)
  const hasCoords = Number.isFinite(parcelLat) && Number.isFinite(parcelLng)

  const saveNotes = () => {
    if (!notesDirty) return
    onLeadUpdate?.({ ...lead, notes, updatedAt: new Date().toISOString() })
    setNotesDirty(false)
  }

  const handleDelete = async () => {
    const ok = await showConfirm(
      'Delete this lead?',
      linkedDeals.length > 0
        ? `This lead has ${linkedDeals.length} deal(s) in pipes. Delete anyway?`
        : 'This cannot be undone.'
    )
    if (!ok) return
    try {
      await deleteLead(getToken, lead.id)
      showToast('Lead deleted', 'success')
      onLeadDeleted?.()
      onClose?.()
    } catch (e) {
      showToast(e.message || 'Could not delete lead', 'error')
    }
  }

  const closeMenu = () => {
    setMenuOpen(false)
  }

  const openMenu = (event) => {
    event.stopPropagation()
    menuTriggerRef.current = event.currentTarget
    setMenuOpen(true)
  }

  const handleShareChange = async (next) => {
    if (!isOwner || !getToken) return
    setShareState(next)
    setSavingShares(true)
    try {
      const saved = await updateLead(getToken, lead.id, {
        visibility: next.visibility,
        sharedMemberUids: next.sharedMemberUids,
        teamId: activeTeam?.id || null,
        teamShares: next.visibility === VISIBILITY.TEAM && activeTeam ? [activeTeam.id] : [],
      })
      onLeadUpdate?.(saved)
      showToast('Sharing updated', 'success')
    } catch (e) {
      const norm = normalizeResourceVisibility(lead)
      setShareState({
        visibility: norm.visibility || VISIBILITY.PRIVATE,
        sharedMemberUids: norm.sharedMemberUids || [],
      })
      showToast(e.message || 'Could not update sharing', 'error')
    } finally {
      setSavingShares(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.() }}>
      <DialogContent
        className="map-panel list-panel lead-details-panel fullscreen-panel flex flex-col min-h-0 p-0 gap-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">Lead details</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <PanelBackButton onClick={onClose} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold truncate">{name}</DialogTitle>
                <p className="text-xs opacity-50 truncate mt-0.5" title={lead.address || undefined}>{address}</p>
              </div>
            </div>
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
          </div>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4 min-h-0"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="space-y-2">
            {lead.phone && (
              <button
                type="button"
                className="w-full flex items-center gap-3 text-sm py-2 text-left hover:opacity-80"
                onClick={() => onPhoneClick?.(lead.phone, parcelData)}
              >
                <Phone className="h-4 w-4 opacity-50 shrink-0" />
                <span>{lead.phone}</span>
              </button>
            )}
            {lead.email && (
              <button
                type="button"
                className="w-full flex items-center gap-3 text-sm py-2 text-left hover:opacity-80 truncate"
                onClick={() => onEmailClick?.(lead.email, parcelData)}
              >
                <Mail className="h-4 w-4 opacity-50 shrink-0" />
                <span className="truncate">{lead.email}</span>
              </button>
            )}
            {lead.parcelId && (
              <button
                type="button"
                className="w-full flex items-center gap-3 text-sm py-2 text-left hover:opacity-80"
                onClick={() => onGoToParcelOnMap?.(parcelData || lead)}
              >
                <MapPin className="h-4 w-4 opacity-50 shrink-0" />
                <span>View on map</span>
              </button>
            )}
            {hasCoords && (
              <DirectionsPicker lat={parcelLat} lng={parcelLng} variant="row" />
            )}
          </div>

          {(activeTeam && (isOwner || shareState.visibility !== VISIBILITY.PRIVATE)) && (
            <section>
              {isOwner ? (
                <ResourceSharePicker
                  team={activeTeam}
                  visibility={shareState.visibility}
                  sharedMemberUids={shareState.sharedMemberUids}
                  onChange={handleShareChange}
                  disabled={savingShares}
                  allowExternalSharing={allowExternalSharing}
                  collapsible
                />
              ) : (
                <div className="flex items-center gap-2">
                  <VisibilityBadge resource={lead} />
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase opacity-50 mb-2">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
              onBlur={saveNotes}
              rows={4}
              className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 resize-none"
              placeholder="Lead notes…"
            />
          </section>

          <LeadTasksSection
            lead={lead}
            leads={leads}
            pipelines={pipelines}
            teams={teams}
            getToken={getToken}
            onPipelinesChange={onPipelinesChange}
            onOpenScheduleAtDate={onOpenScheduleAtDate}
            refreshKey={taskListEpoch}
          />

          <section>
            <h3 className="text-xs font-semibold uppercase opacity-50 mb-2">Deals</h3>
            {linkedDeals.length === 0 ? (
              <p className="text-xs opacity-40 py-2">No deals yet. Add this lead to a pipe to start tracking.</p>
            ) : (
              <ul className="space-y-1.5">
                {linkedDeals.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDeal?.(d, d.__pipelineId)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left"
                    >
                      <Briefcase className="h-4 w-4 shrink-0 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{d.title || d.leadAddress}</div>
                        <div className="text-[11px] opacity-40 flex gap-2 flex-wrap items-center">
                          <span>{d.__pipelineTitle}</span>
                          <span>{getColumnName(d.status, d.__columns)}</span>
                          {formatTimeInState(d) && <span>{formatTimeInState(d)}</span>}
                          <DealProfitBadge deal={d} className="text-[11px]" />
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>

      <OptionsMenuDropdown
        open={menuOpen}
        onClose={closeMenu}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-lead-details-menu"
      >
        <OptionsMenuItem onClick={() => { closeMenu(); onEditLead?.(lead) }}>
          <Pencil className="h-4 w-4 shrink-0" />
          Edit lead
        </OptionsMenuItem>
        <OptionsMenuItem onClick={() => { closeMenu(); onCreateDeal?.(lead) }}>
          <Plus className="h-4 w-4 shrink-0" />
          Create deal
        </OptionsMenuItem>
        <OptionsMenuItem
          destructive
          className="list-panel-delete-btn rounded-b-xl pb-2 hover:bg-red-600/80"
          onClick={() => { closeMenu(); handleDelete() }}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Delete lead
        </OptionsMenuItem>
      </OptionsMenuDropdown>
    </Dialog>
  )
}

export default LeadDetails
