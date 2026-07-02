import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import {
  Phone,
  Mail,
  MapPin,
  Pencil,
  Trash2,
  Briefcase,
  ChevronRight,
  MoreVertical,
  Share2,
  Plus,
  MessageSquare,
  StickyNote,
  ArrowRightLeft,
  Handshake,
  Navigation,
  Camera,
  FileText,
  Upload,
  Download,
  Loader2,
} from 'lucide-react'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { PanelBackButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handleChildPanelDismiss } from './ui/panelDialogUtils'
import { DirectionsPicker } from './DirectionsPicker'
import { cn } from '@/lib/utils'
import {
  resolveResourceAccess,
  canMutateLeadPhotos,
  canEdit,
  canChangeVisibility,
  canDelete,
  userActiveTeam,
  VISIBILITY,
  normalizeResourceVisibility,
} from '@/utils/access'
import {
  displayLeadName,
  formatLeadAddress,
  deleteLead,
  updateLead,
  getLeadStatus,
  getLeadStatusMeta,
} from '@/utils/leads'
import {
  setLeadStatus,
  logLeadNote,
  sortActivitiesNewestFirst,
} from '@/utils/leadActivity'
import { VisibilityBadge } from './ResourceSharePicker'
import { ShareResourceDialog } from './ShareResourceDialog'
import { LeadOwnerChip } from './leads/LeadOwnerChip'
import { isLeadOwnedByCurrentUser } from '@/utils/leadOwner'
import { findDealsForLead } from '@/utils/deals'
import { formatTimeInState } from '@/utils/dealPipeline'
import { LeadTasksSection } from './LeadTasksSection'
import { DealProfitBadge } from './DealLineItemsSection'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { TagPicker } from './tags/TagPicker'
import { collectTagMetaFromEntities } from '@/utils/tags'
import { PhotoGallery } from '@/photos/PhotoGallery'
import { fetchPhotoReports } from '@/utils/photoReports'
import { QuoteStatusBadge } from './quotes/QuoteStatusBadge'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { getLeadPhones, getLeadEmails, getLeadPhoneDetails, getLeadEmailDetails } from '@/utils/leadContact'
import { LeadContactActionTile } from './leads/LeadContactActionTile'
import { LeadContactSourceIcon } from './leads/LeadContactSourceIcon'
import {
  uploadLeadFile,
  downloadLeadFile,
  deleteLeadFile,
  fetchLeadFileBlob,
  sumLeadFileBytes,
  LEAD_FILE_STORAGE_LIMIT_BYTES,
} from '@/utils/leadFiles'
import { StorageUsageBar } from './ui/StorageUsageBar'
import { FilePreviewOverlay } from './ui/FilePreviewOverlay'

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

const ACTIVITY_FEED_LIMIT = 10

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
      <Icon className="lead-detail-action-icon shrink-0 opacity-80" aria-hidden />
      <span className="lead-detail-action-label">{label}</span>
    </button>
  )
}

function LeadContactRow({ icon: Icon, label, value, onClick, multiline = false, detail = null }) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">{label}</div>
          <LeadContactSourceIcon detail={detail} className="h-3 w-3 opacity-70" />
        </div>
        <div
          className={cn('text-sm text-white/90', multiline ? 'whitespace-normal leading-snug' : 'truncate')}
          title={value}
        >
          {value}
        </div>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="lead-detail-contact-row">
        {content}
      </button>
    )
  }

  return <div className="lead-detail-contact-row lead-detail-contact-row--static">{content}</div>
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
  obscuredByChild = false,
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
  stackedOverlay = false,
  hideOverlay = true,
  suppressBackdrop = true,
  primaryDetail = false,
  externalNestedOverlay = false,
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
  leadStatuses = [],
}) {
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [localShareState, setLocalShareState] = useState(null)
  const [activityNote, setActivityNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [leadReports, setLeadReports] = useState([])
  const [leadReportsLoading, setLeadReportsLoading] = useState(false)
  const [contactPickerOpen, setContactPickerOpen] = useState(false)
  const contactPickerDepthRef = useRef(0)
  const handleContactPickerOpenChange = useCallback((open) => {
    contactPickerDepthRef.current = Math.max(0, contactPickerDepthRef.current + (open ? 1 : -1))
    setContactPickerOpen(contactPickerDepthRef.current > 0)
  }, [])
  const [tasksNestedOverlay, setTasksNestedOverlay] = useState(false)
  const [photosNestedOverlay, setPhotosNestedOverlay] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewFileIndex, setPreviewFileIndex] = useState(null)
  const fileInputRef = useRef(null)
  const menuTriggerRef = useRef(null)

  const extraTagDefinitions = useMemo(
    () => collectTagMetaFromEntities(leads),
    [leads],
  )

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '')
      setNotesDirty(false)
    }
  }, [lead])

  useEffect(() => {
    setMenuOpen(false)
    setShareOpen(false)
    setLocalShareState(null)
  }, [lead?.id, isOpen])

  useEffect(() => {
    if (!lead?.id || !getToken || !canAccessReports || !onOpenPhotoReport) {
      setLeadReports([])
      setLeadReportsLoading(false)
      return undefined
    }
    let cancelled = false
    setLeadReportsLoading(true)
    ;(async () => {
      try {
        const list = await fetchPhotoReports(getToken, { leadId: lead.id })
        if (!cancelled) setLeadReports(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setLeadReports([])
      } finally {
        if (!cancelled) setLeadReportsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [lead?.id, getToken, canAccessReports, onOpenPhotoReport])

  const linkedDeals = useMemo(() => {
    if (!lead?.id) return []
    return findDealsForLead(pipelines, lead.id)
  }, [lead, pipelines])

  const effectiveStatus = getLeadStatus(lead, linkedDeals.length, leadStatuses)
  const statusMeta = getLeadStatusMeta(effectiveStatus, leadStatuses)
  const activities = useMemo(
    () => sortActivitiesNewestFirst(lead),
    [lead?.activity, lead?.id]
  )

  const activityFeedRef = useRef(null)
  const [activityFeedMaxHeight, setActivityFeedMaxHeight] = useState(undefined)

  const measureActivityFeedHeight = useCallback(() => {
    const feed = activityFeedRef.current
    if (!feed) return
    const items = feed.querySelectorAll('[data-activity-item]')
    if (items.length === 0) {
      setActivityFeedMaxHeight(undefined)
      return
    }
    const visibleCount = Math.min(items.length, ACTIVITY_FEED_LIMIT)
    const first = items[0]
    const last = items[visibleCount - 1]
    setActivityFeedMaxHeight(last.offsetTop + last.offsetHeight - first.offsetTop)
  }, [])

  useLayoutEffect(() => {
    measureActivityFeedHeight()
  }, [activities, measureActivityFeedHeight])

  useEffect(() => {
    const feed = activityFeedRef.current
    if (!feed || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measureActivityFeedHeight())
    observer.observe(feed)
    return () => observer.disconnect()
  }, [measureActivityFeedHeight])

  const photosReadOnly = useMemo(() => {
    const uid = currentUser?.uid || currentUserId
    if (!lead || !uid) return true
    const user = { uid, email: currentUser?.email || '' }
    const team = userActiveTeam(teams, uid)
    const access = resolveResourceAccess(lead, user, team, teams)
    return !canMutateLeadPhotos(user, lead, access)
  }, [lead, currentUser, currentUserId, teams])

  const filesReadOnly = useMemo(() => {
    const uid = currentUser?.uid || currentUserId
    if (!lead || !uid || !onLeadUpdate) return true
    const user = { uid, email: currentUser?.email || '' }
    const team = userActiveTeam(teams, uid)
    const access = resolveResourceAccess(lead, user, team, teams)
    return !canEdit(access) || access === 'admin_view'
  }, [lead, currentUser, currentUserId, teams, onLeadUpdate])

  const uid = currentUser?.uid || currentUserId
  const activeTeam = useMemo(() => userActiveTeam(teams, uid), [teams, uid])
  const leadAccess = useMemo(() => {
    if (!lead || !uid) return null
    const user = { uid, email: currentUser?.email || '' }
    return resolveResourceAccess(lead, user, activeTeam, teams)
  }, [lead, uid, currentUser?.email, activeTeam, teams])
  const canShareLead = canChangeVisibility(leadAccess)
  const canDeleteLead = canDelete(leadAccess)

  useEffect(() => {
    if (!shareOpen) {
      setLocalShareState(null)
      return
    }
    const norm = normalizeResourceVisibility(lead || {})
    setLocalShareState({
      visibility: norm.visibility || VISIBILITY.PRIVATE,
      sharedMemberUids: norm.sharedMemberUids || [],
    })
  }, [shareOpen, lead])

  const handleShareChange = useCallback(
    (next) => {
      if (!lead?.id || !getToken) return
      setLocalShareState(next)
      void (async () => {
        try {
          const teamId = activeTeam?.id
          const saved = await updateLead(getToken, lead.id, {
            visibility: next.visibility,
            sharedMemberUids: next.sharedMemberUids || [],
            teamId: next.visibility === VISIBILITY.TEAM ? teamId : null,
            teamShares: next.visibility === VISIBILITY.TEAM && teamId ? [teamId] : [],
          })
          onLeadUpdate?.(saved, { localOnly: true })
        } catch (e) {
          const norm = normalizeResourceVisibility(lead || {})
          setLocalShareState({
            visibility: norm.visibility || VISIBILITY.PRIVATE,
            sharedMemberUids: norm.sharedMemberUids || [],
          })
          showToast(e.message || 'Failed to update sharing', 'error')
        }
      })()
    },
    [lead, getToken, activeTeam, onLeadUpdate],
  )

  const persistLead = useCallback((patch) => {
    onLeadUpdate?.({ ...lead, ...patch, updatedAt: new Date().toISOString() })
  }, [lead, onLeadUpdate])

  const leadFilesUsed = sumLeadFileBytes(lead?.files)
  const leadStorageFull = leadFilesUsed >= LEAD_FILE_STORAGE_LIMIT_BYTES
  const leadFilePreviewItems = (lead?.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    contentType: f.contentType,
    loadBlob: () => fetchLeadFileBlob(getToken, f.key),
  }))

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !lead?.id) return
    setUploading(true)
    try {
      const record = await uploadLeadFile(getToken, {
        leadId: lead.id,
        file,
        existingFiles: lead.files || [],
      })
      persistLead({ files: [...(lead.files || []), record] })
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
      await deleteLeadFile(getToken, { key: file.key, leadId: lead.id })
      persistLead({ files: (lead.files || []).filter((f) => f.id !== file.id) })
      showToast('File deleted', 'success')
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    }
  }

  if (!isOpen || !lead) return null

  const name = displayLeadName(lead)
  const address = formatLeadAddress(lead)
  const parcelLat = Number(lead.lat ?? parcelData?.lat ?? parcelData?.properties?.LATITUDE ?? parcelData?.properties?.latitude)
  const parcelLng = Number(lead.lng ?? parcelData?.lng ?? parcelData?.properties?.LONGITUDE ?? parcelData?.properties?.longitude)
  const hasCoords = Number.isFinite(parcelLat) && Number.isFinite(parcelLng)
  const canViewOnMap = !!(lead.parcelId || hasCoords)
  const phones = getLeadPhones(lead)
  const emails = getLeadEmails(lead)
  const phoneDetails = getLeadPhoneDetails(lead)
  const emailDetails = getLeadEmailDetails(lead)
  const hasContactInfo = !!(address || phones.length || emails.length)

  const saveNotes = () => {
    if (!notesDirty) return
    onLeadUpdate?.({ ...lead, notes, updatedAt: new Date().toISOString() })
    setNotesDirty(false)
  }

  const handleDelete = async () => {
    const ok = await showConfirm({
      title: 'Delete lead?',
      message: linkedDeals.length > 0
        ? `This lead has ${linkedDeals.length} deal(s) in pipes. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
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
        leadStatuses,
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

  const standaloneDocked = !!panelDockSlot || (topLayer && !nestedOverlay)
  const effectiveTopLayer = obscuredByChild ? false : (topLayer || nestedOverlay)
  const effectiveHideOverlay = hideOverlay || standaloneDocked
  const effectiveSuppressBackdrop = suppressBackdrop || standaloneDocked
  const suppressClickOutDismiss = primaryDetail || panelDockSlot === 'primary'
  const hasNestedOverlay = menuOpen || tasksNestedOverlay || photosNestedOverlay || externalNestedOverlay || previewFileIndex != null || contactPickerOpen

  return (
    <Dialog
      open={isOpen}
      modal={false}
      onOpenChange={(open) => handleChildPanelDismiss(open, onClose, {
        suppress: suppressClickOutDismiss,
        hasNestedOverlay,
        wasOpen: isOpen,
      })}
    >
      <DialogContent
        className={cn(
          'map-panel list-panel lead-details-panel fullscreen-panel flex flex-col min-h-0 p-0 gap-0',
          stackedOverlay && 'lead-details-stacked-overlay',
          obscuredByChild && 'crm-panel-obscured',
        )}
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        detailFocusOverlay={false}
        hideOverlay={effectiveHideOverlay}
        suppressBackdrop={effectiveSuppressBackdrop}
        nestedOverlay={nestedOverlay}
        topLayer={effectiveTopLayer}
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
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span
                    className={cn(
                      'inline-flex text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium',
                      statusMeta.color
                    )}
                  >
                    {statusMeta.label}
                  </span>
                  <VisibilityBadge
                    resource={lead}
                    className="normal-case tracking-normal text-[11px]"
                    collaboratorHint={!isLeadOwnedByCurrentUser(lead, {
                      uid: currentUser?.uid || currentUserId,
                    })}
                  />
                  <LeadOwnerChip
                    lead={lead}
                    teams={teams}
                    currentUser={currentUser}
                    currentUserId={currentUserId}
                  />
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
              <LeadContactActionTile
                icon={Phone}
                label="Call"
                values={phones}
                contactDetails={phoneDetails}
                contactKind="phone"
                formatValue={formatPhoneDisplay}
                onSelect={(phone) => onPhoneClick?.(phone, parcelData, lead.id)}
                onPickerOpenChange={handleContactPickerOpenChange}
              />
              <LeadContactActionTile
                icon={MessageSquare}
                label="Text"
                values={phones}
                contactDetails={phoneDetails}
                contactKind="phone"
                formatValue={formatPhoneDisplay}
                pickerTitle="Choose a number"
                pickerSubtitle="This lead has multiple phone numbers. Pick one to text."
                onSelect={(phone) => onTextClick?.(phone, parcelData, lead.id)}
                onPickerOpenChange={handleContactPickerOpenChange}
              />
              <LeadContactActionTile
                icon={Mail}
                label="Email"
                values={emails}
                contactDetails={emailDetails}
                contactKind="email"
                onSelect={(email) => onEmailClick?.(email, parcelData, lead.id)}
                onPickerOpenChange={handleContactPickerOpenChange}
              />
              {canViewOnMap ? (
                <LeadActionTile
                  icon={MapPin}
                  label="Map"
                  value={lead.parcelId ? 'View property' : 'View on map'}
                  onClick={() => {
                    onClose?.()
                    onGoToParcelOnMap?.(parcelData || lead)
                  }}
                />
              ) : (
                <LeadActionTile icon={MapPin} label="Map" value="No location" disabled />
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
                <LeadDetailSectionTitle
                  action={onEditLead ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-white/50 hover:text-white/80"
                      onClick={() => onEditLead(lead)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  ) : null}
                >
                  Contact
                </LeadDetailSectionTitle>
                {!hasContactInfo ? (
                  <p className="text-xs text-white/40">
                    No contact info on file.
                    {onEditLead ? ' Tap Edit to add details.' : ''}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {address && (
                      <LeadContactRow
                        icon={MapPin}
                        label="Address"
                        value={address}
                        multiline
                        onClick={canViewOnMap ? () => {
                          onClose?.()
                          onGoToParcelOnMap?.(parcelData || lead)
                        } : undefined}
                      />
                    )}
                    {phoneDetails.map((detail, index) => (
                      <LeadContactRow
                        key={`phone-${detail.value}-${index}`}
                        icon={Phone}
                        label={phoneDetails.length > 1 ? `Phone ${index + 1}` : 'Phone'}
                        value={formatPhoneDisplay(detail.value)}
                        detail={detail}
                        onClick={() => onPhoneClick?.(detail.value, parcelData, lead.id)}
                      />
                    ))}
                    {emailDetails.map((detail, index) => (
                      <LeadContactRow
                        key={`email-${detail.value}-${index}`}
                        icon={Mail}
                        label={emailDetails.length > 1 ? `Email ${index + 1}` : 'Email'}
                        value={detail.value}
                        detail={detail}
                        onClick={() => onEmailClick?.(detail.value, parcelData, lead.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="lead-detail-section">
                <LeadDetailSectionTitle>Status</LeadDetailSectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {leadStatuses.filter((s) => s.id !== 'converted' || linkedDeals.length > 0).map((s) => {
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
                  extraDefinitions={extraTagDefinitions}
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
                <PhotoGallery
                  entityType="lead"
                  entity={lead}
                  getToken={getToken}
                  currentUser={currentUser || (currentUserId ? { uid: currentUserId } : null)}
                  readOnly={photosReadOnly}
                  onEntityUpdate={onLeadUpdate}
                  onNestedOverlayChange={setPhotosNestedOverlay}
                />
              )}

              <section className="lead-detail-section">
                <LeadDetailSectionTitle
                  action={
                    !filesReadOnly ? (
                      <>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={uploading || leadStorageFull}
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
                </LeadDetailSectionTitle>
                <StorageUsageBar
                  usedBytes={leadFilesUsed}
                  limitBytes={LEAD_FILE_STORAGE_LIMIT_BYTES}
                  className="mb-2"
                  label="Lead storage"
                />
                <ul className="space-y-1.5">
                  {(lead.files || []).length === 0 && (
                    <li className="text-xs text-white/40 py-1">No files</li>
                  )}
                  {(lead.files || []).map((f, fileIndex) => (
                    <li key={f.id}>
                      <div className="lead-detail-deal-card">
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
                          className="lead-detail-file-action-btn shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadLeadFile(getToken, f.key, f.name)
                          }}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                        </button>
                        {!filesReadOnly && (
                          <button
                            type="button"
                            className="lead-detail-file-action-btn shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteFile(f)
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5 opacity-40 hover:opacity-80" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

            </div>

            <div className="space-y-3">
              <LeadTasksSection
                lead={lead}
                leads={leads}
                pipelines={pipelines}
                teams={teams}
                getToken={getToken}
                onPipelinesChange={onPipelinesChange}
                onOpenScheduleAtDate={onOpenScheduleAtDate}
                refreshKey={taskListEpoch}
                onNestedOverlayChange={setTasksNestedOverlay}
              />

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
                          className="lead-detail-deal-card lead-detail-list-card"
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
                        Create
                      </Button>
                    )}
                  >
                    Reports
                  </LeadDetailSectionTitle>
                  {leadReportsLoading ? (
                    <div className="flex items-center gap-2 py-2 text-xs opacity-50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      Loading reports…
                    </div>
                  ) : leadReports.length === 0 ? (
                    <p className="text-xs text-white/40">No reports yet</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {leadReports.map((report) => {
                        const sectionCount = (report.sections || []).length
                        return (
                          <li key={report.id}>
                            <button
                              type="button"
                              disabled={!onOpenPhotoReport}
                              onClick={() => onOpenPhotoReport?.(report.id)}
                              className="lead-detail-deal-card lead-detail-list-card disabled:opacity-60 disabled:pointer-events-none"
                            >
                              <FileText className="h-4 w-4 shrink-0 opacity-50" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{report.title || 'Report'}</div>
                                <div className="text-[11px] text-white/45 flex gap-2 flex-wrap items-center mt-0.5">
                                  <QuoteStatusBadge status={report.status || 'draft'} />
                                  <span>{sectionCount} section{sectionCount === 1 ? '' : 's'}</span>
                                  {report.updatedAt && (
                                    <span>{new Date(report.updatedAt).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )}

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
                  <div
                    ref={activityFeedRef}
                    className="overflow-y-auto pr-1"
                    style={activityFeedMaxHeight != null ? { maxHeight: activityFeedMaxHeight } : undefined}
                  >
                  <ul className="space-y-2">
                    {activities.map((entry) => {
                      const Icon = ACTIVITY_ICONS[entry.type] || StickyNote
                      return (
                        <li
                          key={entry.id}
                          data-activity-item
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
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </DialogContent>

      <FilePreviewOverlay
        open={previewFileIndex != null}
        onClose={() => setPreviewFileIndex(null)}
        items={leadFilePreviewItems}
        initialIndex={previewFileIndex ?? 0}
      />

      <OptionsMenuDropdown
        open={menuOpen}
        onClose={closeMenu}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-lead-details-menu"
      >
        <OptionsMenuItem onClick={() => { closeMenu(); onCreateDeal?.(lead) }}>
          <Plus className="h-4 w-4 shrink-0" />
          Create deal
        </OptionsMenuItem>
        {canShareLead && (
          <OptionsMenuItem onClick={() => { closeMenu(); setShareOpen(true) }}>
            <Share2 className="h-4 w-4 shrink-0" />
            Share lead
          </OptionsMenuItem>
        )}
        {canDeleteLead && (
          <OptionsMenuItem
            destructive
            className="list-panel-delete-btn rounded-b-xl pb-2 hover:bg-red-600/80"
            onClick={() => { closeMenu(); handleDelete() }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Delete lead
          </OptionsMenuItem>
        )}
      </OptionsMenuDropdown>

      <ShareResourceDialog
        open={shareOpen}
        onOpenChange={(open) => { if (!open) setShareOpen(false) }}
        title="Share lead"
        team={activeTeam}
        showTeamPicker={Boolean(activeTeam)}
        shareState={localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }}
        onShareStateChange={handleShareChange}
        allowExternalSharing={teamMembership?.allowExternalSharing === true}
      />
    </Dialog>
  )
}

export default LeadDetails
