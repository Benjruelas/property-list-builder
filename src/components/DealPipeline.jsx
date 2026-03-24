import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, Pencil, X, ArrowRight, Settings, ListTodo, CheckSquare, Square, ChevronDown, ChevronUp, Calendar, Eye, EyeOff, MoreVertical, Share2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { loadColumns, saveColumns, loadLeads, saveLeads, loadTitle, saveTitle, formatTimeInState, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getAllTasks, addLeadTask, toggleLeadTask, updateLeadTaskSchedule, updateLeadTaskTitle, deleteLeadTask, formatTaskTimeAgo, formatTaskCompletedDate, formatTaskScheduledDate } from '@/utils/leadTasks'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { LeadDetails } from './LeadDetails'
import { SchedulePicker } from './SchedulePicker'

const MAX_COLUMNS = 10
const TASK_MENU_WIDTH = 160
const TASK_MENU_HEIGHT = 200
const PADDING = 8

function positionTaskMenu(rect) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  let top = rect.bottom + 4
  // Align menu's right edge with button's right edge so menu opens leftward
  let left = rect.right - TASK_MENU_WIDTH
  if (top + TASK_MENU_HEIGHT > vh - PADDING) top = Math.max(PADDING, rect.top - TASK_MENU_HEIGHT - 4)
  if (left + TASK_MENU_WIDTH > vw - PADDING) left = vw - TASK_MENU_WIDTH - PADDING
  if (left < PADDING) left = PADDING
  return { top, left }
}

export function DealPipeline({ isOpen, onClose, onOpenParcelDetails, onEmailClick, onPhoneClick, onSkipTraceParcel, skipTracingInProgress, leads = [], onLeadsChange, onOpenScheduleAtDate, pipelines = [], activePipelineId, onPipelinesChange, onActivePipelineChange, onSharePipeline, onValidateShareEmail, currentUser, getToken, onColumnsChange, onTitleChange }) {
  const { scheduleSync } = useUserDataSync()
  const apiMode = pipelines.length > 0
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) || pipelines[0]
  const [columns, setColumns] = useState([])
  const [localLeads, setLocalLeads] = useState([])
  const displayLeads = onLeadsChange ? leads : localLeads
  const setDisplayLeads = onLeadsChange ? onLeadsChange : setLocalLeads
  const [editingColumnId, setEditingColumnId] = useState(null)
  const [editingColumnName, setEditingColumnName] = useState('')
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [draggedLeadId, setDraggedLeadId] = useState(null)
  const [dragOverColId, setDragOverColId] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [pipelineTitle, setPipelineTitle] = useState('Deal Pipeline')
  const [selectedLead, setSelectedLead] = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false)
  const [addTaskLeadId, setAddTaskLeadId] = useState('')
  const [addTaskLeadSearch, setAddTaskLeadSearch] = useState('')
  const [addTaskSuggestionsOpen, setAddTaskSuggestionsOpen] = useState(false)
  const [addTaskHighlightIndex, setAddTaskHighlightIndex] = useState(-1)
  const [addTaskTitle, setAddTaskTitle] = useState('')
  const [addTaskScheduledAt, setAddTaskScheduledAt] = useState(null)
  const [addTaskScheduledEndAt, setAddTaskScheduledEndAt] = useState(null)
  const [addTaskFromLead, setAddTaskFromLead] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [scheduledSectionCollapsed, setScheduledSectionCollapsed] = useState(false)
  const [unscheduledSectionCollapsed, setUnscheduledSectionCollapsed] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskScheduledAt, setEditTaskScheduledAt] = useState(null)
  const [editTaskScheduledEndAt, setEditTaskScheduledEndAt] = useState(null)
  const [taskMenu, setTaskMenu] = useState(null) // { task, anchor: { top, left } }
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false)
  const [pipelineDropdownAnchor, setPipelineDropdownAnchor] = useState(null)
  const [sharePipelineId, setSharePipelineId] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const validateShareTimeoutRef = useRef(null)
  const justDraggedRef = useRef(false)

  const isPipelineOwnedByUser = (p) => p?.ownerId === currentUser?.uid

  const runShareValidation = useCallback(async (email) => {
    const trimmed = (email || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      return
    }
    if (!onValidateShareEmail) {
      setShareEmailValid(true)
      setShareEmailError('')
      return
    }
    setIsValidatingShare(true)
    setShareEmailError('')
    try {
      const { valid } = await onValidateShareEmail(trimmed)
      setShareEmailValid(valid)
      setShareEmailError(valid ? '' : 'No user found with this email')
    } catch {
      setShareEmailValid(false)
      setShareEmailError('Could not validate email')
    } finally {
      setIsValidatingShare(false)
    }
  }, [onValidateShareEmail])

  useEffect(() => {
    if (!sharePipelineId) return
    const trimmed = (shareEmail || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      if (validateShareTimeoutRef.current) {
        clearTimeout(validateShareTimeoutRef.current)
        validateShareTimeoutRef.current = null
      }
      return
    }
    if (validateShareTimeoutRef.current) clearTimeout(validateShareTimeoutRef.current)
    validateShareTimeoutRef.current = setTimeout(() => {
      validateShareTimeoutRef.current = null
      runShareValidation(shareEmail)
    }, 400)
    return () => {
      if (validateShareTimeoutRef.current) clearTimeout(validateShareTimeoutRef.current)
    }
  }, [sharePipelineId, shareEmail, runShareValidation])

  const refreshAllTasks = useCallback(() => {
    setAllTasks(getAllTasks())
  }, [])

  useEffect(() => {
    if (!selectedLead) refreshAllTasks()
  }, [selectedLead, refreshAllTasks])

  useEffect(() => {
    if (isOpen) {
      if (apiMode && activePipeline) {
        setColumns(activePipeline.columns || [])
        setPipelineTitle(activePipeline.title || 'Deal Pipeline')
      } else {
        setColumns(loadColumns())
        setPipelineTitle(loadTitle())
        let lsLeads = loadLeads()
        const needsMigration = lsLeads.some(l =>
          (l.statusEnteredAt == null && l.createdAt != null) || (l.cumulativeTimeByStatus == null)
        )
        if (needsMigration) {
          lsLeads = lsLeads.map(l => ({
            ...l,
            statusEnteredAt: l.statusEnteredAt ?? l.createdAt ?? Date.now(),
            cumulativeTimeByStatus: l.cumulativeTimeByStatus || {},
          }))
          saveLeads(lsLeads)
          if (onLeadsChange) onLeadsChange(lsLeads)
          scheduleSync()
        }
        if (!onLeadsChange) setLocalLeads(lsLeads)
      }
      refreshAllTasks()
    }
  }, [isOpen, onLeadsChange, scheduleSync, refreshAllTasks, apiMode, activePipeline])

  const persistColumns = useCallback((cols) => {
    setColumns(cols)
    if (apiMode && onColumnsChange) {
      onColumnsChange(cols)
    } else {
      saveColumns(cols)
      scheduleSync()
    }
  }, [scheduleSync, apiMode, onColumnsChange])

  const persistLeads = useCallback((l) => {
    setDisplayLeads(l)
    if (apiMode && onLeadsChange) {
      onLeadsChange(l)
    } else {
      saveLeads(l)
      scheduleSync()
    }
  }, [setDisplayLeads, scheduleSync, apiMode, onLeadsChange])

  const handleAddColumn = () => {
    if (!newColumnName.trim() || columns.length >= MAX_COLUMNS) return
    const id = `col-${Date.now()}`
    persistColumns([...columns, { id, name: newColumnName.trim() }])
    setNewColumnName('')
    setShowAddColumn(false)
    showToast('Column added', 'success')
  }

  const handleDeleteColumn = async (colId) => {
    const col = columns.find(c => c.id === colId)
    const count = displayLeads.filter(l => l.status === colId).length
    const message = count > 0
      ? `Delete "${col?.name}"? ${count} lead(s) will be moved to the first column.`
      : `Delete "${col?.name}"?`
    const confirmed = await showConfirm(message, 'Delete column')
    if (!confirmed) return
    const firstColId = columns[0]?.id
    const now = Date.now()
    const updatedLeads = displayLeads.map(l => {
      if (l.status !== colId) return l
      const entered = l.statusEnteredAt ?? l.createdAt ?? now
      const stintMs = Math.max(0, now - entered)
      const cum = { ...(l.cumulativeTimeByStatus || {}) }
      cum[colId] = (cum[colId] || 0) + stintMs
      return { ...l, status: firstColId || colId, statusEnteredAt: now, cumulativeTimeByStatus: cum }
    })
    persistLeads(updatedLeads)
    persistColumns(columns.filter(c => c.id !== colId))
    showToast('Column deleted', 'success')
  }

  const handleRenameColumn = (colId) => {
    if (!editingColumnName.trim()) {
      setEditingColumnId(null)
      return
    }
    persistColumns(columns.map(c => c.id === colId ? { ...c, name: editingColumnName.trim() } : c))
    setEditingColumnId(null)
    setEditingColumnName('')
    showToast('Column renamed', 'success')
  }

  const handleDeleteLead = async (leadId, e) => {
    e?.stopPropagation()
    const lead = displayLeads.find((l) => l.id === leadId)
    const leadLabel = lead ? [getStreetAddress(lead) || lead.address, lead.owner].filter(Boolean).join(' — ') || 'Unknown' : 'Unknown'
    const confirmed = await showConfirm('Remove this lead from the pipeline?', 'Remove lead', { detail: leadLabel })
    if (!confirmed) return
    if (selectedLead?.id === leadId) setSelectedLead(null)
    persistLeads(displayLeads.filter(l => l.id !== leadId))
    showToast('Lead removed', 'success')
  }

  const handleMoveLead = (leadId, newStatus) => {
    const now = Date.now()
    persistLeads(displayLeads.map(l => {
      if (l.id !== leadId) return l
      if (l.status === newStatus) return l
      const entered = l.statusEnteredAt ?? l.createdAt ?? now
      const stintMs = Math.max(0, now - entered)
      const cum = { ...(l.cumulativeTimeByStatus || {}) }
      cum[l.status] = (cum[l.status] || 0) + stintMs
      return { ...l, status: newStatus, statusEnteredAt: now, cumulativeTimeByStatus: cum }
    }))
  }

  const handleMoveToNext = (leadId) => {
    const lead = displayLeads.find(l => l.id === leadId)
    if (!lead) return
    const idx = columns.findIndex(c => c.id === lead.status)
    if (idx < 0 || idx >= columns.length - 1) return
    handleMoveLead(leadId, columns[idx + 1].id)
  }

  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
  }

  const handleDragEnd = () => {
    setDraggedLeadId(null)
    setDragOverColId(null)
    justDraggedRef.current = true
    setTimeout(() => { justDraggedRef.current = false }, 0)
  }

  const handleDragOver = (e, colId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColId(colId)
  }

  const handleDragLeave = () => {
    setDragOverColId(null)
  }

  const handleDrop = (e, colId) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    if (leadId) handleMoveLead(leadId, colId)
    setDraggedLeadId(null)
    setDragOverColId(null)
  }

  const getLeadsForColumn = (colId) => displayLeads.filter(l => l.status === colId)

  const leadToParcelData = (lead) => ({
    id: lead.parcelId,
    address: lead.address,
    properties: lead.properties || { OWNER_NAME: lead.owner, SITUS_ADDR: lead.address, LATITUDE: lead.lat, LONGITUDE: lead.lng },
    lat: lead.lat,
    lng: lead.lng,
  })

  const handleLeadClick = (lead) => {
    if (justDraggedRef.current) return
    setSelectedLead(lead)
  }

  const toggleEditMode = () => {
    setIsEditMode((prev) => {
      if (prev) {
        setEditingColumnId(null)
        setShowAddColumn(false)
        setNewColumnName('')
        const trimmed = pipelineTitle.trim() || 'Deal Pipeline'
        if (apiMode && onTitleChange) {
          onTitleChange(trimmed)
        } else {
          saveTitle(trimmed)
          scheduleSync()
        }
      }
      return !prev
    })
  }

  const handleTitleBlur = () => {
    const trimmed = pipelineTitle.trim() || 'Deal Pipeline'
    setPipelineTitle(trimmed)
    if (apiMode && onTitleChange) {
      onTitleChange(trimmed)
    } else {
      saveTitle(trimmed)
      scheduleSync()
    }
  }

  const displayTasks = apiMode
    ? allTasks.filter((t) => t.parcelId === '__unassigned__' || displayLeads.some((l) => l.parcelId === t.parcelId))
    : allTasks

  const getLeadLabel = (parcelId) => {
    if (!parcelId || parcelId === '__unassigned__') return 'Unassigned'
    const lead = displayLeads.find((l) => l.parcelId === parcelId)
    if (lead) return getStreetAddress(lead) || lead.address || lead.owner || parcelId
    return parcelId
  }

  const addTaskLeadSuggestions = (() => {
    const q = (addTaskLeadSearch || '').trim().toLowerCase()
    if (!q) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    const results = []
    for (const lead of displayLeads) {
      const label = (getLeadLabel(lead.parcelId) || '').toLowerCase()
      const fullAddr = (getFullAddress(lead) || '').toLowerCase()
      const owner = (lead.owner || '').toLowerCase()
      const address = (lead.address || '').toLowerCase()
      const searchable = [label, fullAddr, owner, address].filter(Boolean).join(' ')
      if (!tokens.every((tok) => searchable.includes(tok))) continue
      const ownerStr = (lead.owner || '').trim()
      const addressStr = (getStreetAddress(lead) || lead.address || '').trim()
      const fullAddrStr = (getFullAddress(lead) || '').trim()
      const ownerMatched = ownerStr && tokens.every((t) => owner.toLowerCase().includes(t))
      const addressMatched = (addressStr || fullAddrStr) && tokens.every((t) => (address + ' ' + fullAddr).toLowerCase().includes(t))
      let matchLabel, displayValue
      if (ownerMatched && !addressMatched) {
        matchLabel = 'Owner'
        displayValue = ownerStr
      } else if (addressMatched && !ownerMatched) {
        matchLabel = 'Address'
        displayValue = fullAddrStr || addressStr || getLeadLabel(lead.parcelId)
      } else if (ownerMatched && addressMatched) {
        matchLabel = 'Owner · Address'
        displayValue = `${ownerStr} — ${fullAddrStr || addressStr || getLeadLabel(lead.parcelId)}`
      } else {
        matchLabel = null
        displayValue = getLeadLabel(lead.parcelId)
      }
      results.push({ lead, matchLabel, displayValue })
    }
    return results
  })()

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { setIsEditMode(false); setEditingColumnId(null); setShowAddColumn(false); setTaskMenu(null); onClose?.() } }}>
      <DialogContent
        className="map-panel deal-pipeline-panel fullscreen-panel flex flex-col"
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          if (e.target?.closest?.('[data-pipeline-dropdown]') || e.target?.closest?.('[data-share-pipeline-dialog]')) e.preventDefault()
        }}
      >
        <DialogHeader className="deal-pipeline-header px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Manage leads in your deal pipeline</DialogDescription>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isEditMode ? (
                <Input
                  value={pipelineTitle}
                  onChange={(e) => setPipelineTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  className="text-xl font-semibold h-9 border-gray-300 flex-1 min-w-0"
                  placeholder="Pipeline title"
                />
              ) : (
                <DialogTitle className="text-xl font-semibold truncate">{pipelineTitle}</DialogTitle>
              )}
              {apiMode && onSharePipeline && isPipelineOwnedByUser(activePipeline) ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 pipeline-icon-btn ${pipelineDropdownOpen ? 'opacity-90' : ''}`}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setPipelineDropdownAnchor({ top: rect.bottom + 4, left: rect.right - 180 })
                    setPipelineDropdownOpen(true)
                  }}
                  title="Pipeline options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 pipeline-icon-btn deal-pipeline-settings-btn ${isEditMode ? 'deal-pipeline-edit-active' : ''} ${apiMode && !isPipelineOwnedByUser(activePipeline) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !apiMode || isPipelineOwnedByUser(activePipeline) ? toggleEditMode() : null}
                  title={apiMode && !isPipelineOwnedByUser(activePipeline) ? 'Edit mode disabled for shared pipelines' : (isEditMode ? 'Exit edit mode' : 'Edit pipeline')}
                  disabled={apiMode && !isPipelineOwnedByUser(activePipeline)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" className="pipeline-icon-btn" onClick={() => { setIsEditMode(false); setEditingColumnId(null); setShowAddColumn(false); setPipelineDropdownOpen(false); setSharePipelineId(null); onClose?.() }} title="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden deal-pipeline-content">
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide px-4 pt-0 pb-3 min-w-0 min-h-0 deal-pipeline-columns">
          <div className="flex flex-col lg:flex-row gap-2 h-full min-w-0">
            {columns.map((col) => (
              <div
                key={col.id}
                className="flex-none lg:flex-1 min-w-0 lg:min-w-[90px] rounded-lg border border-white/15 bg-white/[0.12] flex flex-col min-h-[100px] lg:min-h-[200px]"
              >
                <div className="px-2 py-2 border-b border-white/15 flex items-center gap-1 flex-shrink-0">
                  {editingColumnId === col.id ? (
                    <div className="flex-1 flex gap-1">
                      <Input
                        value={editingColumnName}
                        onChange={(e) => setEditingColumnName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameColumn(col.id)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleRenameColumn(col.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingColumnId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-sm flex-1 truncate">{col.name}</span>
                      {isEditMode && (
                        <>
                          <button type="button" className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 text-inherit" onClick={() => { setEditingColumnId(col.id); setEditingColumnName(col.name) }} title="Rename">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 text-red-400 hover:text-red-300" onClick={() => handleDeleteColumn(col.id)} title="Delete column">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div
                  className={`flex-1 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5 min-h-[60px] transition-colors rounded-b-lg ${dragOverColId === col.id ? 'bg-blue-500/10' : ''}`}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                >
                  {getLeadsForColumn(col.id).map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleLeadClick(lead)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleLeadClick(lead)}
                      className={`deal-pipeline-lead-card px-2 py-1.5 rounded-md border border-white/30 text-white text-xs group cursor-grab active:cursor-grabbing flex items-center gap-1 transition-colors ${draggedLeadId === lead.id ? 'opacity-50' : ''}`}
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-white" title={lead.address}>{getStreetAddress(lead) || lead.address}</div>
                        {lead.owner && <div className="text-[11px] truncate text-white/85">{lead.owner}</div>}
                        {(() => {
                          const duration = formatTimeInState(lead)
                          if (!duration) return null
                          return <div className="text-[10px] mt-0.5 text-white/75" title="Cumulative time in this stage">{duration}</div>
                        })()}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 text-white/90">
                        {isEditMode ? (
                          <button type="button" className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 text-red-400 hover:text-red-300" onClick={(e) => handleDeleteLead(lead.id, e)} title="Remove lead">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed text-white/90"
                            onClick={(e) => { e.stopPropagation(); handleMoveToNext(lead.id) }}
                            title="Move to next stage"
                            disabled={columns.findIndex(c => c.id === lead.status) >= columns.length - 1}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {isEditMode && columns.length < MAX_COLUMNS && (
              <div className="flex-shrink-0 w-full lg:w-[70px] min-h-[70px] lg:min-h-0 flex items-center">
                {showAddColumn ? (
                  <div className="h-full rounded-lg border-2 border-dashed border-gray-300 p-2 flex flex-col gap-2">
                    <Input
                      placeholder="Column name"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddColumn} disabled={!newColumnName.trim()}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddColumn(false); setNewColumnName('') }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex justify-center">
                    <button
                      onClick={() => setShowAddColumn(true)}
                      className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50/50 dark:hover:bg-white/5 flex items-center justify-center text-gray-500"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {/* Task List - all tasks across leads, collapsible (collapses to right edge on desktop, expands pipeline) */}
          <div className={`w-full md:flex-shrink-0 border-t md:border-t-0 md:border-l flex flex-col border-white/20 transition-[width] duration-200 deal-pipeline-tasks ${tasksCollapsed ? 'md:w-16' : 'md:w-80'}`}>
            <div className={`deal-pipeline-tasks-header px-3 py-2 border-b flex items-center gap-2 flex-shrink-0 ${tasksCollapsed ? 'md:flex-row md:px-2 md:py-3 md:justify-between md:min-h-[48px]' : 'justify-between'}`}>
              <button
                type="button"
                className={`flex items-center min-w-0 flex-1 md:flex-none pipeline-icon-btn ${tasksCollapsed ? 'md:justify-between md:w-full md:px-1' : 'gap-2'}`}
                onClick={() => setTasksCollapsed(!tasksCollapsed)}
                title={tasksCollapsed ? 'Expand Task List' : 'Collapse Task List'}
              >
                {tasksCollapsed ? (
                  <>
                    <span className="hidden md:inline opacity-70 order-first flex-shrink-0">
                      <ChevronUp className="h-4 w-4 rotate-[-90deg]" />
                    </span>
                    <span className="hidden md:inline flex-shrink-0 order-last"><ListTodo className="h-4 w-4" /></span>
                    <span className="md:hidden flex items-center gap-2">
                      <ListTodo className="h-4 w-4 flex-shrink-0" />
                      <span className="font-semibold text-sm truncate">Task List</span>
                      {tasksCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </span>
                  </>
                ) : (
                  <>
                    <ListTodo className="h-4 w-4 flex-shrink-0" />
                    <span className="font-semibold text-sm truncate">Task List</span>
                    <span className="ml-1 opacity-70">
                      <span className="md:hidden">{tasksCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
                      <span className="hidden md:inline"><ChevronDown className="h-4 w-4 rotate-[-90deg]" /></span>
                    </span>
                  </>
                )}
              </button>
              {!tasksCollapsed && (
              <div className="flex items-center gap-0.5">
              {displayTasks.filter((t) => t.completed).length > 0 && (
                <button
                  type="button"
                  className="pipeline-icon-btn h-7 w-7 p-0 flex-shrink-0 opacity-80 hover:opacity-100"
                  onClick={() => setShowCompletedTasks((s) => !s)}
                  title={showCompletedTasks ? 'Hide completed tasks' : 'Show completed tasks'}
                >
                  {showCompletedTasks ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="pipeline-icon-btn h-7 w-7 p-0 flex-shrink-0"
                onClick={() => {
                  setAddTaskLeadId('')
                  setAddTaskLeadSearch('')
                  setAddTaskSuggestionsOpen(false)
                  setAddTaskHighlightIndex(-1)
                  setAddTaskTitle('')
                  setAddTaskScheduledAt(null)
                  setAddTaskScheduledEndAt(null)
                  setAddTaskFromLead(false)
                  setShowAddTaskDialog(true)
                }}
                title="Add task"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              </div>
              )}
            </div>
            <div className={`overflow-y-auto scrollbar-hide p-2 space-y-3 max-md:space-y-1.5 max-md:p-1.5 border-white/10 ${tasksCollapsed ? 'hidden' : 'flex-1'} md:flex-1 max-md:max-h-[28vh]`}>
              {displayTasks.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 px-2">No tasks yet</p>
              ) : (
                <>
                  {(() => {
                    const filtered = showCompletedTasks ? displayTasks : displayTasks.filter((t) => !t.completed)
                    const scheduled = filtered.filter((t) => t.scheduledAt)
                    const unscheduled = filtered.filter((t) => !t.scheduledAt)
                    const TaskItem = ({ task }) => (
                  <div
                    className={`text-xs rounded-md p-2 max-md:p-1.5 border cursor-pointer transition-colors ${task.completed ? 'opacity-60 bg-gray-100/70 dark:bg-white/[0.03] border-gray-200/80 dark:border-white/10 hover:opacity-80' : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                    onClick={() => {
                      if (task.parcelId === '__unassigned__') return
                      const lead = displayLeads.find((l) => l.parcelId === task.parcelId)
                      if (lead) setSelectedLead(lead)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' && task.parcelId !== '__unassigned__') { const lead = displayLeads.find((l) => l.parcelId === task.parcelId); if (lead) setSelectedLead(lead) } }}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleLeadTask(task.parcelId, task.id); refreshAllTasks(); scheduleSync() }}
                        className="flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-900"
                        title={task.completed ? 'Mark incomplete' : 'Mark done'}
                      >
                        {task.completed ? (
                          <CheckSquare className="h-3.5 w-3.5 text-green-600 fill-green-600" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={task.completed ? 'line-through text-gray-500' : 'font-medium'}>{task.title || '(untitled)'}</div>
                        {task.parcelId && task.parcelId !== '__unassigned__' && (
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={getLeadLabel(task.parcelId)}>Lead: {getLeadLabel(task.parcelId)}</div>
                        )}
                        {(task.completed || task.scheduledAt) && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {task.completed
                              ? `Completed ${formatTaskCompletedDate(task.completedAt)}`
                              : formatTaskScheduledDate(task.scheduledAt)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTaskMenu({ task, anchor: positionTaskMenu(rect) })
                        }}
                        className="flex-shrink-0 text-gray-500 hover:text-gray-700 p-0.5 -mt-0.5 -mr-0.5"
                        title="Task options"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                    )
                    return (
                      <>
                        {scheduled.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setScheduledSectionCollapsed((c) => !c)}
                              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 mb-1.5 px-0.5 w-full text-left hover:text-white/90"
                            >
                              <span>Scheduled</span>
                              {scheduledSectionCollapsed ? (
                                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                              ) : (
                                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                              )}
                            </button>
                            {!scheduledSectionCollapsed && (
                              <div className="space-y-1.5">
                                {scheduled.map((task) => <TaskItem key={task.id} task={task} />)}
                              </div>
                            )}
                          </div>
                        )}
                        {unscheduled.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setUnscheduledSectionCollapsed((c) => !c)}
                              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 mb-1.5 px-0.5 w-full text-left hover:text-white/90"
                            >
                              <span>Unscheduled</span>
                              {unscheduledSectionCollapsed ? (
                                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                              ) : (
                                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                              )}
                            </button>
                            {!unscheduledSectionCollapsed && (
                              <div className="space-y-1.5">
                                {unscheduled.map((task) => <TaskItem key={task.id} task={task} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      <LeadDetails
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
        parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
        onSkipTraceParcel={onSkipTraceParcel}
        isSkipTracingInProgress={selectedLead && skipTracingInProgress?.has?.(selectedLead.parcelId)}
        onLeadUpdate={(updated) => {
          setSelectedLead(updated)
          persistLeads(displayLeads.map(l => l.id === updated.id ? updated : l))
        }}
        onTasksChange={refreshAllTasks}
        onOpenAddTask={(lead) => {
          if (lead) {
            setAddTaskLeadId(lead.parcelId)
            setAddTaskLeadSearch(getLeadLabel(lead.parcelId))
setAddTaskTitle('')
                  setAddTaskScheduledAt(null)
                  setAddTaskScheduledEndAt(null)
                  setAddTaskFromLead(true)
            setShowAddTaskDialog(true)
          }
        }}
        onViewTaskOnSchedule={onOpenScheduleAtDate ? (task) => {
          if (task?.scheduledAt) {
            setSelectedLead(null)
            onOpenScheduleAtDate(task.scheduledAt)
          }
        } : undefined}
        onOpenEditTask={(task, lead) => {
          if (task) {
            setEditTask({ task, lead: lead || null })
            setEditTaskTitle(task.title || '')
            setEditTaskScheduledAt(task.scheduledAt ?? null)
            setEditTaskScheduledEndAt(task.scheduledEndAt ?? null)
          }
        }}
      />

      {/* Add task from Task List */}
      <Dialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog}>
        <DialogContent className="map-panel list-panel new-task-panel max-w-md max-h-[80vh] p-0" showCloseButton={false} nestedOverlay>
          <DialogHeader className="px-6 pt-6 pb-2 border-b border-white/20">
            <DialogTitle className="text-xl font-semibold">New Task</DialogTitle>
            <DialogDescription className="sr-only">Create a new task and assign it to a lead</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-140px)] space-y-3 create-list-form">
            {!addTaskFromLead ? (
            <div className="relative">
              <label className="text-xs font-medium block mb-1 opacity-90">Assign to lead</label>
              <Input
                value={addTaskLeadSearch}
                onChange={(e) => {
                  setAddTaskLeadSearch(e.target.value)
                  setAddTaskLeadId('') // clear selection when typing
                  setAddTaskSuggestionsOpen(e.target.value.trim().length > 0)
                  setAddTaskHighlightIndex(-1)
                }}
                onBlur={() => setTimeout(() => setAddTaskSuggestionsOpen(false), 150)}
                placeholder="Type address or name..."
                className="text-sm"
                autoFocus={!addTaskFromLead}
                onKeyDown={(e) => {
                  if (!addTaskSuggestionsOpen || addTaskLeadSuggestions.length === 0) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAddTaskHighlightIndex((i) => Math.min(i + 1, addTaskLeadSuggestions.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAddTaskHighlightIndex((i) => Math.max(i - 1, -1))
                  } else if (e.key === 'Enter' && addTaskHighlightIndex >= 0 && addTaskLeadSuggestions[addTaskHighlightIndex]) {
                    e.preventDefault()
                    const item = addTaskLeadSuggestions[addTaskHighlightIndex]
                    setAddTaskLeadId(item.lead.parcelId)
                    setAddTaskLeadSearch(getLeadLabel(item.lead.parcelId))
                    setAddTaskSuggestionsOpen(false)
                    setAddTaskHighlightIndex(-1)
                  } else if (e.key === 'Escape') {
                    setAddTaskSuggestionsOpen(false)
                    setAddTaskHighlightIndex(-1)
                  }
                }}
              />
              {addTaskSuggestionsOpen && addTaskLeadSearch.trim() && addTaskLeadSuggestions.length > 0 && (
                <ul
                  className="add-task-lead-dropdown absolute z-50 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto rounded-lg border py-1 text-sm"
                  role="listbox"
                >
                  {addTaskLeadSuggestions.map((item, idx) => (
                    <li
                      key={item.lead.id}
                      role="option"
                      aria-selected={addTaskHighlightIndex === idx}
                      className={`px-3 py-2 cursor-pointer ${addTaskHighlightIndex === idx ? 'bg-white/10' : 'hover:bg-white/10'}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setAddTaskLeadId(item.lead.parcelId)
                        setAddTaskLeadSearch(getLeadLabel(item.lead.parcelId))
                        setAddTaskSuggestionsOpen(false)
                        setAddTaskHighlightIndex(-1)
                      }}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {item.matchLabel && (
                          <span className="text-[10px] uppercase tracking-wide text-white/70">
                            {item.matchLabel}
                          </span>
                        )}
                        <span className="truncate font-medium">{item.displayValue}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            ) : (
            <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95">
              <span className="text-[10px] uppercase text-white/70">Lead</span>
              <div className="truncate">{addTaskLeadSearch || 'Unknown'}</div>
            </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Task title</label>
              <Input
                value={addTaskTitle}
                onChange={(e) => setAddTaskTitle(e.target.value)}
                placeholder="e.g. Call back on Monday"
                className="text-sm"
                autoFocus={addTaskFromLead}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const t = addTaskTitle.trim()
                    if (t) {
                      addLeadTask(addTaskLeadId || null, t, addTaskScheduledAt, addTaskScheduledEndAt)
                      refreshAllTasks()
                      scheduleSync()
                      showToast('Task added', 'success')
                      setShowAddTaskDialog(false)
                      const lead = addTaskLeadId ? displayLeads.find((l) => l.parcelId === addTaskLeadId) : null
                      if (lead) setSelectedLead(lead)
                    }
                  }
                }}
              />
            </div>
            <SchedulePicker
              inline
              value={addTaskScheduledAt}
              onChange={setAddTaskScheduledAt}
              endValue={addTaskScheduledEndAt}
              onEndChange={setAddTaskScheduledEndAt}
              minDate={Date.now()}
            />
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="create-list-btn flex-1"
                onClick={() => {
                  const t = addTaskTitle.trim()
                  if (t) {
                    addLeadTask(addTaskLeadId || null, t, addTaskScheduledAt, addTaskScheduledEndAt)
                    refreshAllTasks()
                    scheduleSync()
                    showToast('Task added', 'success')
                    setShowAddTaskDialog(false)
                    const lead = addTaskLeadId ? displayLeads.find((l) => l.parcelId === addTaskLeadId) : null
                    if (lead) setSelectedLead(lead)
                  }
                }}
                disabled={!addTaskTitle.trim()}
              >
                Create
              </Button>
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={() => setShowAddTaskDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Task dialog */}
      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent className="map-panel list-panel new-task-panel max-w-md max-h-[80vh] p-0" showCloseButton={false} nestedOverlay>
          <DialogHeader className="px-6 pt-6 pb-2 border-b border-white/20">
            <DialogTitle className="text-xl font-semibold">Edit Task</DialogTitle>
            <DialogDescription className="sr-only">Edit task details</DialogDescription>
          </DialogHeader>
          {editTask && (
            <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-140px)] space-y-3 create-list-form">
              {editTask.task.parcelId && editTask.task.parcelId !== '__unassigned__' && (
                <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95 space-y-1">
                  {(() => {
                    const lead = editTask.lead || displayLeads.find((l) => String(l.parcelId) === String(editTask.task.parcelId)) || loadLeads().find((l) => String(l.parcelId) === String(editTask.task.parcelId))
                    const name = (lead?.owner || lead?.properties?.OWNER_NAME || '').toString().trim()
                    const address = lead ? (getFullAddress(lead) || lead.address || getStreetAddress(lead) || '').toString().trim() : ''
                    const fallback = getLeadLabel(editTask.task.parcelId) || editTask.task.parcelId || 'Unknown'
                    return (
                      <>
                        {(name || address) ? (
                          <>
                            {name && <div className="font-medium truncate" title={name}>{name}</div>}
                            {address && <div className={`text-white/85 truncate ${name ? 'text-xs' : ''}`} title={address}>{address}</div>}
                          </>
                        ) : (
                          <div className="truncate" title={fallback}>{fallback}</div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1 opacity-90">Task title</label>
                <Input
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  placeholder="e.g. Call back on Monday"
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const t = editTaskTitle.trim()
                      if (t) {
                        updateLeadTaskTitle(editTask.task.parcelId, editTask.task.id, t)
                        updateLeadTaskSchedule(editTask.task.parcelId, editTask.task.id, editTaskScheduledAt, editTaskScheduledEndAt)
                        refreshAllTasks()
                        scheduleSync()
                        showToast('Task updated', 'success')
                        setEditTask(null)
                      }
                    }
                  }}
                />
              </div>
              <SchedulePicker
                inline
                value={editTaskScheduledAt}
                onChange={setEditTaskScheduledAt}
                endValue={editTaskScheduledEndAt}
                onEndChange={setEditTaskScheduledEndAt}
                minDate={Date.now()}
              />
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="create-list-btn flex-1"
                  onClick={() => {
                    const t = editTaskTitle.trim()
                    if (t) {
                      updateLeadTaskTitle(editTask.task.parcelId, editTask.task.id, t)
                      updateLeadTaskSchedule(editTask.task.parcelId, editTask.task.id, editTaskScheduledAt, editTaskScheduledEndAt)
                      refreshAllTasks()
                      scheduleSync()
                      showToast('Task updated', 'success')
                      setEditTask(null)
                    }
                  }}
                  disabled={!editTaskTitle.trim()}
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={() => setEditTask(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {sharePipelineId && onSharePipeline && (
        <Dialog open={!!sharePipelineId} onOpenChange={(open) => { if (!open) { setSharePipelineId(null); setShareEmail(''); setShareEmailValid(null); setShareEmailError('') } }}>
          <DialogContent className="map-panel list-panel share-list-dialog max-w-sm" focusOverlay data-share-pipeline-dialog>
            <DialogHeader>
              <DialogTitle>Share pipeline</DialogTitle>
              <DialogDescription className="sr-only">Enter an email address to share this pipeline</DialogDescription>
            </DialogHeader>
            {(() => {
              const pipe = pipelines.find((p) => p.id === sharePipelineId)
              const currentShared = pipe?.sharedWith || []
              const isShared = currentShared.length > 0
              return (
                <>
                  {isShared && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Shared with</p>
                      <ul className="space-y-1.5">
                        {currentShared.map((email) => (
                          <li
                            key={email}
                            className="group flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-md bg-black/10 hover:bg-black/15 transition-colors"
                          >
                            <span className="text-sm text-gray-200 truncate">{email}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = currentShared.filter((e) => (e || '').toLowerCase() !== (email || '').toLowerCase())
                                onSharePipeline(sharePipelineId, updated)
                              }}
                              className="opacity-40 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-red-500/30 text-gray-400 hover:text-red-400 transition-opacity"
                              title="Remove from share list"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className={cn(
                      'mb-1',
                      shareEmailValid === true && 'border-green-600 ring-green-500/50',
                      shareEmailValid === false && shareEmail.trim() && 'border-red-500'
                    )}
                  />
                  {shareEmailError && (
                    <p className="text-sm text-red-500 mb-3">{shareEmailError}</p>
                  )}
                  {!shareEmailError && shareEmail.trim() && isValidatingShare && (
                    <p className="text-sm text-gray-500 mb-3">Checking...</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={async () => {
                        if (!sharePipelineId || !onSharePipeline) return
                        const email = shareEmail.trim().toLowerCase()
                        if (!email) { showToast('Please enter an email', 'error'); return }
                        if (shareEmailValid === false) { showToast('No user found with this email', 'error'); return }
                        if (shareEmailValid !== true && onValidateShareEmail) { showToast('Please wait for email validation', 'error'); return }
                        const pipe2 = pipelines.find((p) => p.id === sharePipelineId)
                        const current = pipe2?.sharedWith || []
                        if (current.some((e) => (e || '').toLowerCase() === email)) { showToast('This email is already in the share list', 'error'); return }
                        onSharePipeline(sharePipelineId, [...current, email])
                        setShareEmail('')
                        setShareEmailValid(null)
                        setShareEmailError('')
                        showToast('Email added to share list', 'success')
                      }}
                      disabled={!!(shareEmail.trim() && shareEmailValid === false)}
                      className={cn(
                        'flex-1 min-w-0 share-dialog-btn',
                        shareEmailValid === true && 'share-save-valid'
                      )}
                    >
                      {isValidatingShare ? 'Checking...' : 'Share'}
                    </Button>
                    <Button variant="outline" onClick={() => { setSharePipelineId(null); setShareEmail(''); setShareEmailValid(null); setShareEmailError('') }} className="flex-1 min-w-0 share-dialog-btn">Cancel</Button>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}

      {pipelineDropdownOpen && pipelineDropdownAnchor && apiMode && activePipeline && isPipelineOwnedByUser(activePipeline) && typeof document !== 'undefined' && createPortal(
        <div data-pipeline-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setPipelineDropdownOpen(false)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-xl min-w-[180px] pt-1 overflow-hidden"
            style={{ top: pipelineDropdownAnchor.top, left: pipelineDropdownAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setPipelineDropdownOpen(false); toggleEditMode() }}
              className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              {isEditMode ? 'Exit edit mode' : 'Edit pipeline'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPipelineDropdownOpen(false)
                setSharePipelineId(activePipeline.id)
                setShareEmail('')
                setShareEmailValid(null)
                setShareEmailError('')
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
            >
              <Share2 className="h-4 w-4 flex-shrink-0" />
              Share pipeline
            </button>
          </div>
        </div>,
        document.getElementById('modal-root') || document.body
      )}

      {taskMenu && typeof document !== 'undefined' && createPortal(
        <div data-task-menu className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setTaskMenu(null)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-lg min-w-[160px] py-1 overflow-hidden shadow-xl"
            style={{ top: taskMenu.anchor.top, left: taskMenu.anchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {!taskMenu.task.completed && taskMenu.task.scheduledAt && onOpenScheduleAtDate && (
              <button
                type="button"
                onClick={() => {
                  setTaskMenu(null)
                  setSelectedLead(null)
                  onOpenScheduleAtDate(taskMenu.task.scheduledAt)
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                View on calendar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const lead = displayLeads.find((l) => String(l.parcelId) === String(taskMenu.task.parcelId))
                setTaskMenu(null)
                setSelectedLead(null)
                setEditTask({ task: taskMenu.task, lead: lead || null })
                setEditTaskTitle(taskMenu.task.title || '')
                setEditTaskScheduledAt(taskMenu.task.scheduledAt ?? null)
                setEditTaskScheduledEndAt(taskMenu.task.scheduledEndAt ?? null)
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setTaskMenu(null)
                setSelectedLead(null)
                showConfirm({
                  title: 'Delete task',
                  message: `Delete "${(taskMenu.task.title || '').trim() || '(untitled)'}"?`,
                  confirmLabel: 'Delete',
                  variant: 'danger',
                  onConfirm: () => {
                    deleteLeadTask(taskMenu.task.parcelId, taskMenu.task.id)
                    refreshAllTasks()
                    scheduleSync()
                  }
                })
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
    </Dialog>
  )
}
