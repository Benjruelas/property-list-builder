import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Phone, Mail, User, Pencil, Star, Trash2, Plus, CheckSquare, Square, Search, Loader2, Calendar, MoreVertical, ArrowRightLeft, Archive, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { DirectionsPicker } from './DirectionsPicker'
import { getSkipTracedParcel, updateContactMeta, updateSkipTracedContacts, skipTraceParcels } from '@/utils/skipTrace'
import { getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getLeadTasks, addLeadTask, toggleLeadTask, updateLeadTaskTitle, deleteLeadTask, formatTaskTimeAgo, formatTaskCompletedDate, formatTaskScheduledDate } from '@/utils/leadTasks'
import { addTeamTask, removeTeamTask, toggleTeamTask } from '@/utils/teamTasks'
import { showToast } from './ui/toast'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'
import {
  getClosedLeadNote,
  saveClosedLeadNote,
  getClosedLeadTasks,
  addClosedLeadTask,
  toggleClosedLeadTask,
  updateClosedLeadTaskTitle,
  deleteClosedLeadTask,
  getClosedLeadContacts,
  updateClosedLeadContacts,
  updateClosedLeadContactMeta,
  saveClosedLeadSkipTraceResult,
  getClosedLeadById
} from '@/utils/closedLeads'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

const TASK_MENU_WIDTH = 160
const TASK_MENU_HEIGHT = 200
const PADDING = 8
function positionTaskMenu(rect) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  let top = rect.bottom + 4
  // Align menu's right edge with button's right edge so menu opens leftward (matches task list)
  let left = rect.right - TASK_MENU_WIDTH
  if (top + TASK_MENU_HEIGHT > vh - PADDING) top = Math.max(PADDING, rect.top - TASK_MENU_HEIGHT - 4)
  if (left + TASK_MENU_WIDTH > vw - PADDING) left = vw - TASK_MENU_WIDTH - PADDING
  if (left < PADDING) left = PADDING
  return { top, left }
}

/**
 * LeadDetails - Compact panel when a lead is clicked in the Deal Pipeline.
 * Shows owner, address, skip trace data (if available), or a skip trace button.
 */
export function LeadDetails({ isOpen, onClose, lead, parcelData, pipelineId = null, pipelineName = null, pipelineTeamShares = [], getToken = null, onTeamTasksChange, onOpenParcelDetails, onEmailClick, onPhoneClick, onSkipTraceParcel, isSkipTracingInProgress, onLeadUpdate, onTasksChange, onOpenAddTask, onViewTaskOnSchedule, onOpenEditTask, onRequestMoveLead, onRequestRemoveLead, onRequestCloseLead, onGoToParcelOnMap, onGoToPipeline, closedRecord = null, onRequestReopenLead, onRequestDeleteClosedLead }) {
  const isClosed = !!closedRecord
  const closedId = closedRecord?.id || null
  const [closedSnap, setClosedSnap] = useState(closedRecord)
  useEffect(() => { setClosedSnap(closedRecord) }, [closedRecord])
  const refreshClosedSnap = () => {
    if (!closedId) return
    setClosedSnap(getClosedLeadById(closedId))
  }
  const { scheduleSync } = useUserDataSync()
  const [skipTracedInfo, setSkipTracedInfo] = useState(null)
  const [editContacts, setEditContacts] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [tasks, setTasks] = useState([])
  const [showTeamTaskInput, setShowTeamTaskInput] = useState(false)
  const [teamTaskDraft, setTeamTaskDraft] = useState('')
  const [teamTaskPending, setTeamTaskPending] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [taskMenu, setTaskMenu] = useState(null)
  const [pipeMenu, setPipeMenu] = useState(null)
  const [note, setNote] = useState('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [closedSkipTracing, setClosedSkipTracing] = useState(false)

  const parcelId = lead?.parcelId || parcelData?.id

  const readNote = () => {
    if (isClosed) return getClosedLeadNote(closedSnap)
    return parcelId ? (getParcelNote(parcelId) || '') : ''
  }
  const writeNote = (v) => {
    if (isClosed) {
      saveClosedLeadNote(closedId, v)
      refreshClosedSnap()
      return
    }
    if (parcelId) saveParcelNote(parcelId, v)
  }

  const readTasks = () => {
    if (isClosed) return getClosedLeadTasks(closedSnap)
    return parcelId ? getLeadTasks(parcelId, pipelineId) : []
  }

  const refreshTasks = () => {
    if (isClosed) { refreshClosedSnap(); setTasks(getClosedLeadTasks(getClosedLeadById(closedId))) }
    else if (parcelId) setTasks(getLeadTasks(parcelId, pipelineId))
    onTasksChange?.()
  }

  const hasTeamSharing = Array.isArray(pipelineTeamShares) && pipelineTeamShares.length > 0
  const teamTasks = Array.isArray(lead?.teamTasks) ? lead.teamTasks : []
  const canMutateTeamTasks = !!(pipelineId && lead?.id && getToken)

  const handleAddTeamTask = async () => {
    const title = teamTaskDraft.trim()
    if (!title || !canMutateTeamTasks) return
    setTeamTaskPending(true)
    try {
      await addTeamTask(getToken, pipelineId, lead.id, { title })
      setTeamTaskDraft('')
      setShowTeamTaskInput(false)
      onTeamTasksChange?.()
    } catch (e) {
      showToast(e.message || 'Failed to add team task', 'error')
    } finally {
      setTeamTaskPending(false)
    }
  }

  const handleToggleTeamTask = async (taskId) => {
    if (!canMutateTeamTasks) return
    try {
      await toggleTeamTask(getToken, pipelineId, lead.id, taskId)
      onTeamTasksChange?.()
    } catch (e) {
      showToast(e.message || 'Failed to update team task', 'error')
    }
  }

  const handleRemoveTeamTask = async (taskId) => {
    if (!canMutateTeamTasks) return
    try {
      await removeTeamTask(getToken, pipelineId, lead.id, taskId)
      onTeamTasksChange?.()
    } catch (e) {
      showToast(e.message || 'Failed to remove team task', 'error')
    }
  }

  const refreshSkipTrace = () => {
    if (isClosed) {
      const rec = getClosedLeadById(closedId)
      setClosedSnap(rec)
      setSkipTracedInfo(getClosedLeadContacts(rec))
      return
    }
    if (parcelId) setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }
  const fullAddr = (lead || parcelData) ? getFullAddress(lead || parcelData) : ''
  const address = (fullAddr && fullAddr !== 'Unknown' ? fullAddr : null) || lead?.address || parcelData?.address || parcelData?.properties?.SITUS_ADDR || parcelData?.properties?.SITE_ADDR || 'No address available'
  const displayName = lead?.owner ?? parcelData?.properties?.OWNER_NAME ?? ''

  useEffect(() => {
    if (isOpen && isClosed && closedId) {
      const rec = getClosedLeadById(closedId) || closedRecord
      setClosedSnap(rec)
      setSkipTracedInfo(getClosedLeadContacts(rec))
      setTasks(getClosedLeadTasks(rec))
      setNote(getClosedLeadNote(rec))
      setIsEditingNote(false)
    } else if (isOpen && parcelId) {
      const info = getSkipTracedParcel(parcelId)
      setSkipTracedInfo(info)
      setTasks(getLeadTasks(parcelId, pipelineId))
      setNote(getParcelNote(parcelId) || '')
      setIsEditingNote(false)
    } else {
      setSkipTracedInfo(null)
      setTasks([])
      setTaskMenu(null)
      setPipeMenu(null)
      setNote('')
      setIsEditingNote(false)
    }
  }, [isOpen, parcelId, pipelineId, isClosed, closedId, closedRecord])

  if (!lead && !parcelData) return null

  const dataForParcelDetails = parcelData || {
    id: parcelId,
    address,
    properties: lead?.properties || { OWNER_NAME: displayName, SITUS_ADDR: address, LATITUDE: lead?.lat, LONGITUDE: lead?.lng },
    lat: lead?.lat,
    lng: lead?.lng,
  }

  const handleViewParcelData = () => {
    onOpenParcelDetails?.(dataForParcelDetails)
    // Don't close LeadDetails - ParcelDetails opens on top; when ParcelDetails is closed, LeadDetails remains visible
  }

  const normalizePhone = (p) => (p || '').replace(/[^\d+]/g, '')

  const handleSaveName = () => {
    const trimmed = nameDraft.trim()
    if (lead && trimmed) {
      const updated = { ...lead, owner: trimmed }
      onLeadUpdate?.(updated)
      scheduleSync()
    }
    setIsEditingName(false)
    setNameDraft('')
  }

  const handleStartEditName = () => {
    setNameDraft(displayName)
    setIsEditingName(true)
  }

  const handleSaveNote = () => {
    if (isClosed) {
      writeNote(note)
    } else {
      if (!parcelId) return
      saveParcelNote(parcelId, note)
    }
    scheduleSync()
    setIsEditingNote(false)
  }

  const handleCancelNote = () => {
    setNote(readNote())
    setIsEditingNote(false)
  }

  const phoneDetails = skipTracedInfo?.phoneDetails || (skipTracedInfo?.phoneNumbers || (skipTracedInfo?.phone ? [skipTracedInfo.phone] : [])).map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 }))
  const emailDetails = skipTracedInfo?.emailDetails || (skipTracedInfo?.emails || (skipTracedInfo?.email ? [skipTracedInfo.email] : [])).map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 }))
  const hasSkipTraced = !!skipTracedInfo?.skipTracedAt
  const hasAnyContact = phoneDetails.length > 0 || emailDetails.length > 0

  const applyContactMeta = (type, value, meta) => {
    if (isClosed) updateClosedLeadContactMeta(closedId, type, value, meta)
    else updateContactMeta(parcelId, type, value, meta)
  }
  const applyContactsUpdate = (type, newDetails) => {
    if (isClosed) updateClosedLeadContacts(closedId, type, newDetails)
    else updateSkipTracedContacts(parcelId, type, newDetails)
  }

  const doToggleTask = (taskId) => {
    if (isClosed) toggleClosedLeadTask(closedId, taskId)
    else toggleLeadTask(parcelId, taskId)
  }
  const doDeleteTask = (taskId) => {
    if (isClosed) deleteClosedLeadTask(closedId, taskId)
    else deleteLeadTask(parcelId, taskId)
  }
  const doUpdateTaskTitle = (taskId, title) => {
    if (isClosed) updateClosedLeadTaskTitle(closedId, taskId, title)
    else updateLeadTaskTitle(parcelId, taskId, title)
  }

  const closedDate = closedSnap?.closedAt
    ? new Date(closedSnap.closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o && !pipeMenu) onClose?.() }}>
      <DialogContent className="map-panel lead-details-panel max-w-xs p-0 rounded-2xl" showCloseButton={false} blurOverlay onPointerDownOutside={(e) => { if (pipeMenu) e.preventDefault() }} onInteractOutside={(e) => { if (pipeMenu) e.preventDefault() }}>
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-gray-200">
          <DialogDescription className="sr-only">Lead details, notes, contact information, and tasks</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-lg font-semibold flex items-center min-w-0">
              <User className="h-5 w-5 shrink-0" />
            </DialogTitle>
            <div className="map-panel-header-actions gap-1">
              <DirectionsPicker lat={dataForParcelDetails?.lat} lng={dataForParcelDetails?.lng} />
              {(isClosed ? (onRequestReopenLead || onRequestDeleteClosedLead) : (lead && (onRequestCloseLead || (pipelineId && (onRequestMoveLead || onRequestRemoveLead))))) && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Lead options"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setPipeMenu(prev => prev ? null : { anchor: positionTaskMenu(rect) })
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-4 py-4 space-y-4 text-left bg-transparent">
          <div className="space-y-1">
            {isEditingName ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setIsEditingName(false); setNameDraft('') } }}
                  className="border rounded px-2 py-1.5 text-sm font-bold flex-1 min-w-0"
                  autoFocus
                  placeholder="Lead name"
                />
                <Button variant="default" size="sm" onClick={handleSaveName}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => { setIsEditingName(false); setNameDraft('') }}>Cancel</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={lead ? handleStartEditName : undefined}
                className={`text-gray-900 font-bold block text-left ${lead ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                title={lead ? 'Click to edit name' : undefined}
              >
                {displayName || (lead ? 'Click to add name' : '—')}
              </button>
            )}
          </div>

          <div className="space-y-1 pt-3 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address</div>
            <button
              type="button"
              onClick={() => {
                const data = { ...dataForParcelDetails }
                onGoToParcelOnMap?.(data)
                onClose?.()
              }}
              className="text-blue-400 hover:text-blue-300 hover:underline text-left transition-colors"
            >
              {address}
            </button>
          </div>

          {/* Notes — same parcel-level notes as More Details / lists */}
          {parcelId && (
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</div>
              {isEditingNote ? (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note..."
                    className="w-full min-h-[72px] p-2.5 rounded-lg text-sm resize-y border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" type="button" onClick={handleCancelNote}>
                      Cancel
                    </Button>
                    <Button size="sm" type="button" onClick={handleSaveNote}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : note ? (
                <button
                  type="button"
                  onClick={() => setIsEditingNote(true)}
                  className="w-full text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 hover:bg-gray-100 transition-colors whitespace-pre-wrap"
                  title="Edit note"
                >
                  {note}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingNote(true)}
                  className="w-full text-left rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                >
                  + Add a note…
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5 pt-3 border-t border-gray-200 flex flex-col items-start">
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Info</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => { setEditContacts((e) => !e); setNewPhone(''); setNewEmail('') }}
                  title={editContacts ? 'Done editing' : 'Add phone or email'}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {phoneDetails.map((p, idx) => (
                <div key={`p-${idx}`} className="flex items-center justify-between gap-2 text-sm group">
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    {onPhoneClick ? (
                      <button
                        type="button"
                        onClick={() => onPhoneClick(p.value, dataForParcelDetails)}
                        className="text-blue-600 hover:underline truncate text-left"
                      >
                        {p.value}
                      </button>
                    ) : (
                      <a href={`tel:${normalizePhone(p.value)}`} className="text-blue-600 hover:underline truncate">{p.value}</a>
                    )}
                    {p.callerId && <span className="text-gray-500 text-xs flex-shrink-0">({p.callerId})</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {editContacts ? (
                      <button
                        type="button"
                        onClick={() => { applyContactMeta('phone', p.value, { primary: !p.primary }); refreshSkipTrace(); scheduleSync() }}
                        title={p.primary ? 'Remove from primary' : 'Set as primary'}
                        className="text-amber-500 hover:text-amber-600"
                      >
                        {p.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                      </button>
                    ) : (
                      p.primary && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" title="Primary" />
                    )}
                    {editContacts && (
                      <button
                        type="button"
                        onClick={() => { applyContactsUpdate('phone', phoneDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
                        className="text-red-500 hover:text-red-600 opacity-70 hover:opacity-100 p-0.5"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {editContacts && (
                <div className="flex items-center gap-2 justify-start w-full">
                  <input
                    type="tel"
                    placeholder="Add phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-36"
                    onKeyDown={(e) => { if (e.key === 'Enter') { applyContactsUpdate('phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 lead-details-add-btn"
                    onClick={() => { if (newPhone.trim()) { applyContactsUpdate('phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {emailDetails.map((e, idx) => (
                <div key={`e-${idx}`} className="flex items-center justify-between gap-2 text-sm group">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    {onEmailClick ? (
                      <button onClick={() => onEmailClick(e.value, dataForParcelDetails)} className="text-sky-600 hover:underline truncate">{e.value}</button>
                    ) : (
                      <span className="text-gray-900 truncate">{e.value}</span>
                    )}
                    {e.callerId && <span className="text-gray-500 text-xs flex-shrink-0">({e.callerId})</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {editContacts ? (
                      <button
                        type="button"
                        onClick={() => { applyContactMeta('email', e.value, { primary: !e.primary }); refreshSkipTrace(); scheduleSync() }}
                        title={e.primary ? 'Remove from primary' : 'Set as primary'}
                        className="text-amber-500 hover:text-amber-600"
                      >
                        {e.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                      </button>
                    ) : (
                      e.primary && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" title="Primary" />
                    )}
                    {editContacts && (
                      <button
                        type="button"
                        onClick={() => { applyContactsUpdate('email', emailDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
                        className="text-red-500 hover:text-red-600 opacity-70 hover:opacity-100 p-0.5"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {editContacts && (
                <div className="flex items-center gap-2 justify-start w-full">
                  <input
                    type="email"
                    placeholder="Add email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-44"
                    onKeyDown={(e) => { if (e.key === 'Enter') { applyContactsUpdate('email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 lead-details-add-btn"
                    onClick={() => { if (newEmail.trim()) { applyContactsUpdate('email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {skipTracedInfo?.address && (
                <p className="text-sm text-gray-900">{skipTracedInfo.address}</p>
              )}
              {!hasSkipTraced && (onSkipTraceParcel || isClosed) && (
                <div className={`flex justify-start w-full ${hasAnyContact ? 'pt-1' : ''}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-green-400 hover:text-green-300 px-2"
                    onClick={async () => {
                      if (isClosed) {
                        if (closedSkipTracing) return
                        const addr = dataForParcelDetails?.address || address
                        if (!addr) { showToast('No address available to skip trace', 'error'); return }
                        try {
                          setClosedSkipTracing(true)
                          const resp = await skipTraceParcels([{ parcelId: parcelId || closedId, address: addr, ownerName: displayName || undefined }])
                          const info = resp?.results?.[0]?.contactInfo || resp?.results?.[0] || null
                          if (info && !info.error) {
                            saveClosedLeadSkipTraceResult(closedId, {
                              phoneDetails: info.phoneDetails,
                              emailDetails: info.emailDetails,
                              phoneNumbers: info.phoneNumbers,
                              emails: info.emails,
                              address: info.address,
                              skipTracedAt: info.skipTracedAt || new Date().toISOString()
                            })
                            refreshSkipTrace()
                            scheduleSync()
                            const hasAny = (info.phoneDetails?.length || info.emailDetails?.length || info.phoneNumbers?.length || info.emails?.length)
                            showToast(hasAny ? 'Contact info added' : 'Skip trace completed — no contacts found', hasAny ? 'success' : 'warning')
                          } else if (info?.error) {
                            showToast(info.error, 'error')
                          } else {
                            showToast('Skip trace returned no data', 'warning')
                          }
                        } catch (e) {
                          showToast(e.message || 'Skip trace failed', 'error')
                        } finally {
                          setClosedSkipTracing(false)
                        }
                        return
                      }
                      await onSkipTraceParcel(dataForParcelDetails)
                      refreshSkipTrace()
                    }}
                    disabled={isClosed ? closedSkipTracing : isSkipTracingInProgress}
                  >
                    {(isClosed ? closedSkipTracing : isSkipTracingInProgress) ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {(isClosed ? closedSkipTracing : isSkipTracingInProgress) ? 'Getting contact...' : 'Get Contact Info'}
                  </Button>
                </div>
              )}
            </div>

          {/* Team Tasks (visible to all team members with access to this pipeline) */}
          {!isClosed && hasTeamSharing && canMutateTeamTasks && (
            <div className="pt-3 border-t border-gray-200 space-y-2">
              <div className="flex items-center gap-2 justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team Tasks</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowTeamTaskInput((v) => !v)}
                  title="Add team task"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {showTeamTaskInput && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={teamTaskDraft}
                    onChange={(e) => setTeamTaskDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTeamTask()
                      else if (e.key === 'Escape') {
                        setShowTeamTaskInput(false)
                        setTeamTaskDraft('')
                      }
                    }}
                    placeholder="Team task title..."
                    autoFocus
                    disabled={teamTaskPending}
                    className="border rounded px-2 py-1 text-sm w-full"
                  />
                  <Button size="sm" onClick={handleAddTeamTask} disabled={teamTaskPending || !teamTaskDraft.trim()}>
                    Add
                  </Button>
                </div>
              )}
              {teamTasks.length > 0 && (
                <ul className="space-y-1.5">
                  {teamTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2 text-sm group">
                      <button
                        type="button"
                        onClick={() => handleToggleTeamTask(task.id)}
                        className="flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-900"
                        title={task.completedAt ? 'Mark incomplete' : 'Mark done'}
                      >
                        {task.completedAt ? (
                          <CheckSquare className="h-4 w-4 text-green-600 fill-green-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={task.completedAt ? 'line-through text-gray-500' : 'text-gray-900'}>
                            {task.title}
                          </span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide"
                            title="Shared with pipeline team"
                          >
                            Team
                          </span>
                        </div>
                        {(task.completedAt || task.createdByEmail) && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {task.completedAt
                              ? `Completed ${formatTaskCompletedDate(new Date(task.completedAt).getTime())}`
                              : task.createdByEmail
                              ? `Added by ${task.createdByEmail}`
                              : ''}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTeamTask(task.id)}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 p-0.5 -mt-0.5 -mr-0.5 opacity-70 group-hover:opacity-100"
                        title="Delete team task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Tasks */}
          <div className="pt-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {hasTeamSharing ? 'My Tasks' : 'Tasks'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 lead-details-add-btn"
                onClick={() => {
                  if (isClosed) {
                    addClosedLeadTask(closedId, { title: '' })
                    refreshTasks()
                    scheduleSync()
                    return
                  }
                  onOpenAddTask?.(lead)
                }}
                disabled={isClosed ? false : !onOpenAddTask}
                title="Add task"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {tasks.length > 0 && (
              <ul className="space-y-1.5">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2 text-sm group">
                    <button
                      type="button"
                      onClick={() => {
                        doToggleTask(task.id)
                        refreshTasks()
                        scheduleSync()
                      }}
                      className="flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-900"
                      title={task.completed ? 'Mark incomplete' : 'Mark done'}
                    >
                      {task.completed ? (
                        <CheckSquare className="h-4 w-4 text-green-600 fill-green-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      {task.title === '' ? (
                        <input
                          type="text"
                          placeholder="Task title..."
                          className="border rounded px-2 py-1 text-sm w-full"
                          defaultValue=""
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (!v) {
                              doDeleteTask(task.id)
                              refreshTasks()
                            } else {
                              doUpdateTaskTitle(task.id, v)
                              refreshTasks()
                            }
                            scheduleSync()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur()
                          }}
                        />
                      ) : (
                        <>
                          <span className={task.completed ? 'line-through text-gray-500' : 'text-gray-900'}>
                            {task.title}
                          </span>
                          {(task.completed || task.scheduledAt) && (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              <span>
                                {task.completed
                                  ? `Completed ${formatTaskCompletedDate(task.completedAt)}`
                                  : `Scheduled: ${formatTaskScheduledDate(task.scheduledAt)}`}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTaskMenu({ task, anchor: positionTaskMenu(rect) })
                      }}
                      className="flex-shrink-0 text-gray-400 hover:text-gray-700 p-0.5 -mt-0.5 -mr-0.5 opacity-70 group-hover:opacity-100"
                      title="Task options"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isClosed && closedSnap && (
            <div className="pt-3 border-t border-gray-200">
              <span className="leads-stage-badge inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium">
                <Archive className="h-3 w-3" />
                Closed{closedDate ? ` ${closedDate}` : ''}
              </span>
              {closedSnap.closedFrom?.title && (
                <span className="ml-2 text-[11px] opacity-60">from {closedSnap.closedFrom.title}</span>
              )}
            </div>
          )}
          {!isClosed && pipelineName && (
            <div className="pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => onGoToPipeline?.(pipelineId)}
                className="leads-stage-badge inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                {pipelineName}
              </button>
            </div>
          )}

        </div>
      </DialogContent>

      {taskMenu && typeof document !== 'undefined' && createPortal(
        <div data-task-menu className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setTaskMenu(null)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-lg min-w-[160px] py-1 overflow-hidden shadow-xl"
            style={{ top: taskMenu.anchor.top, left: taskMenu.anchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {!taskMenu.task.completed && taskMenu.task.scheduledAt && onViewTaskOnSchedule && (
              <button
                type="button"
                onClick={() => {
                  setTaskMenu(null)
                  onViewTaskOnSchedule(taskMenu.task)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                View on calendar
              </button>
            )}
            {onOpenEditTask && (
              <button
                type="button"
                onClick={() => {
                  setTaskMenu(null)
                  onOpenEditTask(taskMenu.task, lead)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTaskMenu(null)
                doDeleteTask(taskMenu.task.id)
                refreshTasks()
                scheduleSync()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-red-500/20 text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
              Delete
            </button>
          </div>
        </div>,
        document.getElementById('modal-root') || document.body
      )}

      {pipeMenu && typeof document !== 'undefined' && createPortal(
        <div data-pipe-menu className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setPipeMenu(null)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-lg min-w-[160px] py-1 overflow-hidden shadow-xl"
            style={{ top: pipeMenu.anchor.top, left: pipeMenu.anchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {!isClosed && onRequestCloseLead && (
              <button
                type="button"
                onClick={() => {
                  const l = lead, pid = pipelineId
                  setPipeMenu(null)
                  onClose?.()
                  onRequestCloseLead(l, pid)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Archive className="h-3.5 w-3.5 flex-shrink-0" />
                Close Lead
              </button>
            )}
            {!isClosed && pipelineId && onRequestMoveLead && (
              <button
                type="button"
                onClick={() => {
                  const l = lead, pid = pipelineId
                  setPipeMenu(null)
                  onClose?.()
                  onRequestMoveLead(l, pid)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 flex-shrink-0" />
                Move to Pipe
              </button>
            )}
            {!isClosed && pipelineId && onRequestRemoveLead && (
              <button
                type="button"
                onClick={() => {
                  const l = lead, pid = pipelineId
                  setPipeMenu(null)
                  onClose?.()
                  onRequestRemoveLead(l, pid)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-red-500/20 text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                Remove from Pipe
              </button>
            )}
            {isClosed && onRequestReopenLead && (
              <button
                type="button"
                onClick={() => {
                  const rec = closedSnap
                  setPipeMenu(null)
                  onClose?.()
                  onRequestReopenLead(rec)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                Reopen Lead
              </button>
            )}
            {isClosed && onRequestDeleteClosedLead && (
              <button
                type="button"
                onClick={() => {
                  const id = closedId
                  setPipeMenu(null)
                  onClose?.()
                  onRequestDeleteClosedLead(id)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-red-500/20 text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                Delete Archive
              </button>
            )}
          </div>
        </div>,
        document.getElementById('modal-root') || document.body
      )}

    </Dialog>
  )
}
