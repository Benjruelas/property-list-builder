import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Phone,
  Mail,
  MapPin,
  Pencil,
  Trash2,
  Briefcase,
  ChevronRight,
  MoreVertical,
  Plus,
  MessageSquare,
  StickyNote,
  ArrowRightLeft,
  Handshake,
  Navigation,
  Camera,
  FileText,
} from 'lucide-react'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { PanelBackButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange } from './ui/panelDialogUtils'
import { DirectionsPicker } from './DirectionsPicker'
import { cn } from '@/lib/utils'
import {
  displayLeadName,
  formatLeadAddress,
  deleteLead,
  updateLead,
  getLeadStatus,
  getLeadStatusMeta,
  LEAD_STATUSES,
} from '@/utils/leads'
import {
  setLeadStatus,
  logLeadNote,
  sortActivitiesNewestFirst,
} from '@/utils/leadActivity'
import { ResourceSharePicker, VisibilityBadge } from './ResourceSharePicker'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { findDealsForLead } from '@/utils/deals'
import { formatTimeInState } from '@/utils/dealPipeline'
import { LeadTasksSection } from './LeadTasksSection'
import { DealProfitBadge } from './DealLineItemsSection'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { TagPicker } from './tags/TagPicker'
import { LeadPhotoGallery } from './photos/LeadPhotoGallery'
import { fetchPhotoReports } from '@/utils/photoReports'

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

const MENU_WIDTH = 180

const ACTIVITY_ICONS = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
  note: StickyNote,
  status: ArrowRightLeft,
  deal: Handshake,
  photo: Camera,
  report: FileText,
}

function LeadDetailSectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="lead-detail-section-title">{children}</h3>
      {action}
    </div>
  )
}

function LeadActionTile({ icon: Icon, label, value, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={value || label}
      className="lead-detail-action-tile disabled:opacity-40"
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="lead-detail-action-label">{label}</span>
    </button>
  )
}

function formatActivityWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Lead-only detail panel — contact info, notes, linked deals.
 */
export function LeadDetails({
  isOpen,
  panelDockSlot,
  instantDismiss = false,
  onClose,
  lead,
  pipelines = [],
  getToken,
  parcelData,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onTextClick,
  onGoToParcelOnMap,
  onLeadUpdate,
  onEditLead,
  onCreateDeal,
  onOpenDeal,
  onLeadDeleted,
  nestedOverlay = true,
  topLayer = true,
  teams = [],
  teamMembership = null,
  onPipelinesChange,
  onOpenScheduleAtDate,
  leads = [],
  taskListEpoch = 0,
  currentUserId = null,
  currentUser = null,
  canAccessPhotos = true,
  canAccessReports = true,
  onCreatePhotoReport,
  onOpenPhotoReport,
  canSeeDealAmounts = true,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
}) {
  const activeTeam = teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
  const [savingShares, setSavingShares] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activityNote, setActivityNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [leadReports, setLeadReports] = useState([])
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

  useEffect(() => {
    if (!lead?.id || !getToken || !canAccessReports || !onOpenPhotoReport) {
      setLeadReports([])
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchPhotoReports(getToken, { leadId: lead.id })
        if (!cancelled) setLeadReports(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setLeadReports([])
      }
    })()
    return () => { cancelled = true }
  }, [lead?.id, getToken, canAccessReports, onOpenPhotoReport])

  const linkedDeals = useMemo(() => {
    if (!lead?.id) return []
    return findDealsForLead(pipelines, lead.id)
  }, [lead, pipelines])

  const effectiveStatus = getLeadStatus(lead, linkedDeals.length)
  const statusMeta = getLeadStatusMeta(effectiveStatus)
  const activities = useMemo(
    () => sortActivitiesNewestFirst(lead),
    [lead?.activity, lead?.id]
  )

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

  const handleStatusChange = async (nextStatus) => {
    if (!lead?.id || nextStatus === effectiveStatus || statusBusy) return
    if (nextStatus === 'converted' && linkedDeals.length === 0) {
      showToast('Create a deal first to mark as Converted', 'info')
      return
    }
    setStatusBusy(true)
    try {
      const saved = await setLeadStatus(getToken, lead.id, nextStatus, {
        fromStatus: lead.status || 'new',
      })
      onLeadUpdate?.(saved)
    } catch (e) {
      showToast(e.message || 'Could not update status', 'error')
    } finally {
      setStatusBusy(false)
    }
  }

  const handleAddActivityNote = async () => {
    const trimmed = activityNote.trim()
    if (!trimmed || !lead?.id) return
    setSavingNote(true)
    try {
      const saved = await logLeadNote(getToken, lead.id, trimmed)
      onLeadUpdate?.(saved)
      setActivityNote('')
      showToast('Note added', 'success')
    } catch (e) {
      showToast(e.message || 'Could not add note', 'error')
    } finally {
      setSavingNote(false)
    }
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
    <Dialog open={isOpen} modal={false} onOpenChange={(open) => handlePanelDialogOpenChange(open, false, onClose, isOpen)}>
      <DialogContent
        className="map-panel list-panel lead-details-panel fullscreen-panel flex flex-col min-h-0 p-0 gap-0"
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        detailFocusOverlay
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
        instantDismiss={instantDismiss}
      >
        <DialogHeader
          className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">Lead details</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <PanelBackButton onClick={onClose} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold truncate leading-tight">{name}</DialogTitle>
                {address && (
                  <p className="text-xs text-white/50 truncate mt-0.5" title={lead.address || undefined}>{address}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span
                    className={cn(
                      'inline-flex text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium',
                      statusMeta.color
                    )}
                  >
                    {statusMeta.label}
                  </span>
                  <VisibilityBadge resource={lead} className="normal-case tracking-normal text-[11px]" />
                </div>
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
          className="lead-detail-body flex-1 overflow-y-auto scrollbar-hide min-h-0"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="px-5 py-4 border-b border-white/[0.08]">
            <div className="lead-detail-actions-row">
              {lead.phone ? (
                <LeadActionTile
                  icon={Phone}
                  label="Call"
                  value={lead.phone}
                  onClick={() => onPhoneClick?.(lead.phone, parcelData, lead.id)}
                />
              ) : (
                <LeadActionTile icon={Phone} label="Call" value="No phone" disabled />
              )}
              {lead.phone ? (
                <LeadActionTile
                  icon={MessageSquare}
                  label="Text"
                  value={lead.phone}
                  onClick={() => onTextClick?.(lead.phone, parcelData, lead.id)}
                />
              ) : (
                <LeadActionTile icon={MessageSquare} label="Text" value="No phone" disabled />
              )}
              {lead.email ? (
                <LeadActionTile
                  icon={Mail}
                  label="Email"
                  value={lead.email}
                  onClick={() => onEmailClick?.(lead.email, parcelData, lead.id)}
                />
              ) : (
                <LeadActionTile icon={Mail} label="Email" value="No email" disabled />
              )}
              {lead.parcelId ? (
                <LeadActionTile
                  icon={MapPin}
                  label="Map"
                  value="View property"
                  onClick={() => {
                    onClose?.()
                    onGoToParcelOnMap?.(parcelData || lead)
                  }}
                />
              ) : (
                <LeadActionTile icon={MapPin} label="Map" value="No parcel" disabled />
              )}
              {hasCoords ? (
                <DirectionsPicker lat={parcelLat} lng={parcelLng} variant="tile" />
              ) : (
                <LeadActionTile icon={Navigation} label="Directions" value="No location" disabled />
              )}
            </div>
          </div>

          <div className="px-5 py-4 lead-detail-columns-wrap">
            <div className="space-y-3">
              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Status</LeadDetailSectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.filter((s) => s.id !== 'converted' || linkedDeals.length > 0).map((s) => {
                    const active = effectiveStatus === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={statusBusy}
                        onClick={() => handleStatusChange(s.id)}
                        className={cn(
                          'panel-filter-option lead-detail-status-btn',
                          active && cn(s.color, 'panel-filter-option--status-active')
                        )}
                        aria-pressed={active}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Tags</LeadDetailSectionTitle>
                <TagPicker
                  type="leads"
                  entity={lead}
                  tagRegistry={tagRegistry}
                  getToken={getToken}
                  onRegistryChange={onRefreshTags}
                  disabled={!onLeadUpdate}
                  hideWhenEmpty={false}
                  showAddTrigger={!!onLeadUpdate}
                  inline
                  onTagsChange={({ tagIds, tagMeta }) => {
                    onLeadUpdate?.({ id: lead.id, tagIds, tagMeta })
                  }}
                />
              </section>

              {canAccessPhotos && (
                <LeadPhotoGallery
                  lead={lead}
                  getToken={getToken}
                  currentUser={currentUser || (currentUserId ? { uid: currentUserId } : null)}
                  onLeadUpdate={onLeadUpdate}
                />
              )}

              {canAccessReports && onCreatePhotoReport && (
                <section className="lead-detail-section">
                  <LeadDetailSectionTitle
                    action={(
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onCreatePhotoReport(lead.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Create report
                      </Button>
                    )}
                  >
                    Photo reports
                  </LeadDetailSectionTitle>
                  {leadReports.length === 0 ? (
                    <p className="text-xs text-white/40 py-1">No photo reports yet</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {leadReports.map((report) => (
                        <li key={report.id}>
                          <button
                            type="button"
                            onClick={() => onOpenPhotoReport?.(report.id)}
                            className="lead-detail-deal-card w-full"
                          >
                            <FileText className="h-4 w-4 shrink-0 opacity-50" />
                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-sm font-medium truncate">{report.title || 'Photo Report'}</div>
                              <div className="text-[11px] text-white/45 mt-0.5">{report.status || 'draft'}</div>
                            </div>
                            <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {(activeTeam && (isOwner || shareState.visibility !== VISIBILITY.PRIVATE)) && (
                <section className="lead-detail-section">
                  <LeadDetailSectionTitle>Sharing</LeadDetailSectionTitle>
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
                    <VisibilityBadge resource={lead} />
                  )}
                </section>
              )}

              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Deals</LeadDetailSectionTitle>
                {linkedDeals.length === 0 ? (
                  <p className="text-xs text-white/40">No deals yet. Add this lead to a pipe to start tracking.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {linkedDeals.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => onOpenDeal?.(d, d.__pipelineId)}
                          className="lead-detail-deal-card"
                        >
                          <Briefcase className="h-4 w-4 shrink-0 opacity-50" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{d.title || d.leadAddress}</div>
                            <div className="text-[11px] text-white/45 flex gap-2 flex-wrap items-center mt-0.5">
                              <span>{d.__pipelineTitle}</span>
                              <span>{getColumnName(d.status, d.__columns)}</span>
                              {formatTimeInState(d) && <span>{formatTimeInState(d)}</span>}
                              <DealProfitBadge deal={d} className="text-[11px]" canSeeDealAmounts={canSeeDealAmounts} />
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

            <div className="space-y-3">
              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Activity</LeadDetailSectionTitle>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddActivityNote() }}
                    placeholder="Add a note…"
                    className="lead-detail-field flex-1 text-sm px-3 py-2"
                    disabled={savingNote}
                  />
                  <Button size="sm" className="panel-action-btn shrink-0" onClick={handleAddActivityNote} disabled={savingNote || !activityNote.trim()}>
                    {savingNote ? '…' : 'Add'}
                  </Button>
                </div>
                {activities.length === 0 ? (
                  <p className="text-xs text-white/40">No activity yet. Calls, texts, emails, and notes will appear here.</p>
                ) : (
                  <ul className="space-y-2">
                    {activities.map((entry) => {
                      const Icon = ACTIVITY_ICONS[entry.type] || StickyNote
                      return (
                        <li
                          key={entry.id}
                          className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.04]"
                        >
                          <Icon className="h-3.5 w-3.5 mt-0.5 opacity-50 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-snug break-words">{entry.summary}</p>
                            <p className="text-[10px] text-white/40 mt-0.5">{formatActivityWhen(entry.at)}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Notes</LeadDetailSectionTitle>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
                  onBlur={saveNotes}
                  rows={4}
                  className="lead-detail-field w-full text-sm px-3 py-2 resize-none"
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
            </div>
          </div>
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
