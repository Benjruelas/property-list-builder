import { useState, useEffect } from 'react'
import { X, Phone, Mail, User, Pencil, Star, Trash2, Plus, CheckSquare, Square, Search, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { getSkipTracedParcel, updateContactMeta, updateSkipTracedContacts } from '@/utils/skipTrace'
import { getStreetAddress, getFullAddress, updateLead } from '@/utils/dealPipeline'
import { SchedulePicker } from './SchedulePicker'
import { getLeadTasks, addLeadTask, toggleLeadTask, updateLeadTaskTitle, updateLeadTaskSchedule, deleteLeadTask, formatTaskTimeAgo, formatTaskCompletedDate, formatTaskScheduledDate } from '@/utils/leadTasks'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

/**
 * LeadDetails - Compact panel when a lead is clicked in the Deal Pipeline.
 * Shows owner, address, skip trace data (if available), or a skip trace button.
 */
export function LeadDetails({ isOpen, onClose, lead, parcelData, onOpenParcelDetails, onEmailClick, onSkipTraceParcel, isSkipTracingInProgress, onLeadUpdate, onTasksChange, onOpenAddTask }) {
  const { scheduleSync } = useUserDataSync()
  const [skipTracedInfo, setSkipTracedInfo] = useState(null)
  const [editContacts, setEditContacts] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [tasks, setTasks] = useState([])
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const parcelId = lead?.parcelId || parcelData?.id

  const refreshTasks = () => {
    if (parcelId) setTasks(getLeadTasks(parcelId))
    onTasksChange?.()
  }

  const refreshSkipTrace = () => {
    if (parcelId) setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }
  const fullAddr = (lead || parcelData) ? getFullAddress(lead || parcelData) : ''
  const address = (fullAddr && fullAddr !== 'Unknown' ? fullAddr : null) || lead?.address || parcelData?.address || parcelData?.properties?.SITUS_ADDR || parcelData?.properties?.SITE_ADDR || 'No address available'
  const displayName = lead?.owner ?? parcelData?.properties?.OWNER_NAME ?? ''

  useEffect(() => {
    if (isOpen && parcelId) {
      const info = getSkipTracedParcel(parcelId)
      setSkipTracedInfo(info)
      setTasks(getLeadTasks(parcelId))
    } else {
      setSkipTracedInfo(null)
      setTasks([])
    }
  }, [isOpen, parcelId])

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
    if (lead?.id && trimmed) {
      const updated = updateLead(lead.id, { owner: trimmed })
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

  const phoneDetails = skipTracedInfo?.phoneDetails || (skipTracedInfo?.phoneNumbers || (skipTracedInfo?.phone ? [skipTracedInfo.phone] : [])).map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 }))
  const emailDetails = skipTracedInfo?.emailDetails || (skipTracedInfo?.emails || (skipTracedInfo?.email ? [skipTracedInfo.email] : [])).map((v, i) => ({ value: v, verified: null, primary: i === 0 }))
  const hasSkipTraceData = phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo?.address

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent className="map-panel lead-details-panel max-w-md p-0" showCloseButton={false} blurOverlay>
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-gray-200">
          <DialogDescription className="sr-only">Lead details, contact information, and tasks</DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              <User className="h-5 w-5" />
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-4 py-4 space-y-4 text-left">
          <div className="space-y-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setIsEditingName(false); setNameDraft('') } }}
                  className="border rounded px-2 py-1.5 text-sm font-bold flex-1"
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
            <p className="text-gray-900">{address}</p>
          </div>

          {hasSkipTraceData ? (
            <div className="space-y-1.5 pt-3 border-t border-gray-200 flex flex-col items-start">
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacts</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => { setEditContacts((e) => !e); setNewPhone(''); setNewEmail('') }}
                  title={editContacts ? 'Done editing' : 'Edit contacts'}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              {phoneDetails.map((p, idx) => (
                <div key={`p-${idx}`} className="flex items-center justify-between gap-2 text-sm group">
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <a href={`tel:${normalizePhone(p.value)}`} className="text-blue-600 hover:underline truncate">{p.value}</a>
                    {p.callerId && <span className="text-gray-500 text-xs flex-shrink-0">({p.callerId})</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {editContacts ? (
                      <button
                        type="button"
                        onClick={() => { updateContactMeta(parcelId, 'phone', p.value, { primary: !p.primary }); refreshSkipTrace(); scheduleSync() }}
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
                        onClick={() => { updateSkipTracedContacts(parcelId, 'phone', phoneDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { updateSkipTracedContacts(parcelId, 'phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 lead-details-add-btn"
                    onClick={() => { if (newPhone.trim()) { updateSkipTracedContacts(parcelId, 'phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
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
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {editContacts ? (
                      <button
                        type="button"
                        onClick={() => { updateContactMeta(parcelId, 'email', e.value, { primary: !e.primary }); refreshSkipTrace(); scheduleSync() }}
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
                        onClick={() => { updateSkipTracedContacts(parcelId, 'email', emailDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { updateSkipTracedContacts(parcelId, 'email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 lead-details-add-btn"
                    onClick={() => { if (newEmail.trim()) { updateSkipTracedContacts(parcelId, 'email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {skipTracedInfo?.address && (
                <p className="text-sm text-gray-900">{skipTracedInfo.address}</p>
              )}
            </div>
          ) : (
            <div className="pt-3 border-t border-gray-200 flex justify-start">
              <Button
                variant="ghost"
                className="text-green-400 hover:text-green-300"
                onClick={async () => {
                  if (onSkipTraceParcel) {
                    await onSkipTraceParcel(dataForParcelDetails)
                    refreshSkipTrace()
                  }
                }}
                disabled={isSkipTracingInProgress}
              >
                {isSkipTracingInProgress ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {isSkipTracingInProgress ? 'Getting contact...' : 'Get Contact Info'}
              </Button>
            </div>
          )}

          {/* Tasks */}
          <div className="pt-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tasks</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 lead-details-add-btn"
                onClick={() => onOpenAddTask?.(lead)}
                disabled={!onOpenAddTask}
                title={onOpenAddTask ? 'Add task' : 'Add task (open from pipeline)'}
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
                        toggleLeadTask(parcelId, task.id)
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
                              deleteLeadTask(parcelId, task.id)
                              refreshTasks()
                            } else {
                              updateLeadTaskTitle(parcelId, task.id, v)
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
                          <div className="text-[11px] text-gray-500 mt-0.5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span>
                                {task.completed
                                  ? `Completed ${formatTaskCompletedDate(task.completedAt)}`
                                  : task.scheduledAt
                                    ? `Scheduled: ${formatTaskScheduledDate(task.scheduledAt)}`
                                    : `Created ${formatTaskTimeAgo(task.createdAt)}`}
                              </span>
                              {!task.completed && (
                                <SchedulePicker
                                value={task.scheduledAt}
                                onChange={(ts) => {
                                  updateLeadTaskSchedule(parcelId, task.id, ts)
                                  refreshTasks()
                                  scheduleSync()
                                }}
                                minDate={Date.now()}
                                triggerClassName="cursor-pointer p-0 bg-transparent border-none text-white opacity-90 hover:opacity-100"
                                title="Schedule or reschedule"
                                size="sm"
                                taskTitle={task.title || '(untitled)'}
                                leadName={displayName || undefined}
                                leadAddress={address !== 'No address available' ? address : undefined}
                              />
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        deleteLeadTask(parcelId, task.id)
                        refreshTasks()
                        scheduleSync()
                      }}
                      className="flex-shrink-0 mt-0.5 text-gray-400 hover:text-red-600 p-0.5 opacity-70 group-hover:opacity-100"
                      title="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
