import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Pencil, X, ArrowRight, Settings, ListTodo, CheckSquare, Square, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { loadColumns, saveColumns, loadLeads, saveLeads, loadTitle, saveTitle, formatTimeInState, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getAllTasks, addLeadTask, toggleLeadTask, formatTaskTimeAgo, formatTaskCompletedDate, formatTaskScheduledDate, toDatetimeLocal, fromDatetimeLocal } from '@/utils/leadTasks'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { LeadDetails } from './LeadDetails'

const MAX_COLUMNS = 10

export function DealPipeline({ isOpen, onClose, onOpenParcelDetails, onEmailClick, onSkipTraceParcel, skipTracingInProgress, leads = [], onLeadsChange }) {
  const { scheduleSync } = useUserDataSync()
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
  const [addTaskScheduledAt, setAddTaskScheduledAt] = useState('')
  const [addTaskFromLead, setAddTaskFromLead] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const justDraggedRef = useRef(false)

  const refreshAllTasks = useCallback(() => {
    setAllTasks(getAllTasks())
  }, [])

  useEffect(() => {
    if (!selectedLead) refreshAllTasks()
  }, [selectedLead, refreshAllTasks])

  useEffect(() => {
    if (isOpen) {
      setColumns(loadColumns())
      setPipelineTitle(loadTitle())
      let leads = loadLeads()
      const needsMigration = leads.some(l =>
        (l.statusEnteredAt == null && l.createdAt != null) || (l.cumulativeTimeByStatus == null)
      )
      if (needsMigration) {
        leads = leads.map(l => ({
          ...l,
          statusEnteredAt: l.statusEnteredAt ?? l.createdAt ?? Date.now(),
          cumulativeTimeByStatus: l.cumulativeTimeByStatus || {},
        }))
        saveLeads(leads)
        if (onLeadsChange) onLeadsChange(leads)
        scheduleSync()
      }
      if (!onLeadsChange) setLocalLeads(leads)
      refreshAllTasks()
    }
  }, [isOpen, onLeadsChange, scheduleSync, refreshAllTasks])

  const persistColumns = useCallback((cols) => {
    setColumns(cols)
    saveColumns(cols)
    scheduleSync()
  }, [scheduleSync])

  const persistLeads = useCallback((l) => {
    setDisplayLeads(l)
    saveLeads(l)
    scheduleSync()
  }, [setDisplayLeads, scheduleSync])

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
        saveTitle(pipelineTitle)
        scheduleSync()
      }
      return !prev
    })
  }

  const handleTitleBlur = () => {
    const trimmed = pipelineTitle.trim() || 'Deal Pipeline'
    setPipelineTitle(trimmed)
    saveTitle(trimmed)
    scheduleSync()
  }

  const getLeadLabel = (parcelId) => {
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
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { setIsEditMode(false); setEditingColumnId(null); setShowAddColumn(false); onClose?.() } }}>
      <DialogContent
        className="map-panel w-[98vw] max-w-[98vw] h-[95vh] max-h-[95vh] p-0 flex flex-col"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-4 pt-4 pb-3 border-b flex-shrink-0">
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
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 pipeline-icon-btn deal-pipeline-settings-btn ${isEditMode ? 'deal-pipeline-edit-active' : ''}`}
                onClick={toggleEditMode}
                title={isEditMode ? 'Exit edit mode' : 'Edit pipeline'}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="pipeline-icon-btn" onClick={() => { setIsEditMode(false); setEditingColumnId(null); setShowAddColumn(false); onClose?.() }} title="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide px-4 pt-0 pb-3 min-w-0 min-h-0">
          <div className="flex flex-col md:flex-row gap-2 h-full min-w-0">
            {columns.map((col) => (
              <div
                key={col.id}
                className="flex-none md:flex-1 min-w-0 md:min-w-[90px] rounded-lg border-2 border-gray-200 bg-gray-50/50 dark:bg-white/5 flex flex-col min-h-[100px] md:min-h-[200px]"
              >
                <div className="px-2 py-2 border-b flex items-center gap-1 flex-shrink-0">
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
                  className={`flex-1 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5 min-h-[60px] transition-colors rounded-b-lg ${dragOverColId === col.id ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''}`}
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
                      className={`deal-pipeline-lead-card px-2 py-1.5 rounded-md bg-gray-100 border border-gray-300 text-gray-900 text-xs group cursor-grab active:cursor-grabbing flex items-center gap-1 hover:bg-gray-200 transition-colors ${draggedLeadId === lead.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={lead.address}>{getStreetAddress(lead) || lead.address}</div>
                        {lead.owner && <div className="text-[11px] text-gray-600 truncate">{lead.owner}</div>}
                        {(() => {
                          const duration = formatTimeInState(lead)
                          if (!duration) return null
                          return <div className="text-[10px] text-gray-500 mt-0.5" title="Cumulative time in this stage">{duration}</div>
                        })()}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {isEditMode ? (
                          <button type="button" className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 text-red-400 hover:text-red-300" onClick={(e) => handleDeleteLead(lead.id, e)} title="Remove lead">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
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
              <div className="flex-shrink-0 w-full md:w-[70px] min-h-[70px] md:min-h-0 flex items-center">
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
          <div className={`w-full md:flex-shrink-0 border-t md:border-t-0 md:border-l flex flex-col border-white/20 transition-[width] duration-200 ${tasksCollapsed ? 'md:w-12' : 'md:w-80'}`}>
            <div className={`px-3 py-2 border-b flex items-center gap-2 flex-shrink-0 ${tasksCollapsed ? 'md:flex-col md:px-2 md:py-3 md:justify-center md:gap-1' : 'justify-between'}`}>
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 flex-1 md:flex-none pipeline-icon-btn"
                onClick={() => setTasksCollapsed(!tasksCollapsed)}
                title={tasksCollapsed ? 'Expand Task List' : 'Collapse Task List'}
              >
                <ListTodo className="h-4 w-4 flex-shrink-0" />
                <span className={`font-semibold text-sm truncate ${tasksCollapsed ? 'md:hidden' : ''}`}>Task List</span>
                <span className="ml-1 opacity-70">
                  {tasksCollapsed ? <ChevronDown className="h-4 w-4 md:rotate-[-90deg]" /> : <ChevronUp className="h-4 w-4 md:rotate-[-90deg]" />}
                </span>
              </button>
              {!tasksCollapsed && (
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
                  setAddTaskScheduledAt('')
                  setAddTaskFromLead(false)
                  setShowAddTaskDialog(true)
                }}
                disabled={displayLeads.length === 0}
                title={displayLeads.length === 0 ? 'Add leads to the pipeline first' : 'Add task'}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              )}
            </div>
            <div className={`overflow-y-auto scrollbar-hide p-2 space-y-3 max-md:space-y-1.5 max-md:p-1.5 border-white/10 ${tasksCollapsed ? 'hidden' : 'flex-1'} md:flex-1 max-md:max-h-[28vh]`}>
              {allTasks.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 px-2">No tasks yet</p>
              ) : (
                <>
                  {(() => {
                    const scheduled = allTasks.filter((t) => t.scheduledAt)
                    const unscheduled = allTasks.filter((t) => !t.scheduledAt)
                    const TaskItem = ({ task }) => (
                  <div
                    className="text-xs rounded-md p-2 max-md:p-1.5 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                    onClick={() => {
                      const lead = displayLeads.find((l) => l.parcelId === task.parcelId)
                      if (lead) setSelectedLead(lead)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && displayLeads.find((l) => l.parcelId === task.parcelId) && setSelectedLead(displayLeads.find((l) => l.parcelId === task.parcelId))}
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
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={getLeadLabel(task.parcelId)}>Lead: {getLeadLabel(task.parcelId)}</div>
                        <div className="text-[10px] text-gray-500">
                          {task.completed
                            ? `Completed ${formatTaskCompletedDate(task.completedAt)}`
                            : task.scheduledAt
                              ? formatTaskScheduledDate(task.scheduledAt)
                              : `Created ${formatTaskTimeAgo(task.createdAt)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                    )
                    return (
                      <>
                        {scheduled.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 mb-1.5 px-0.5">Scheduled</div>
                            <div className="space-y-1.5">
                              {scheduled.map((task) => <TaskItem key={task.id} task={task} />)}
                            </div>
                          </div>
                        )}
                        {unscheduled.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 mb-1.5 px-0.5">Unscheduled</div>
                            <div className="space-y-1.5">
                              {unscheduled.map((task) => <TaskItem key={task.id} task={task} />)}
                            </div>
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
            setAddTaskScheduledAt('')
            setAddTaskFromLead(true)
            setShowAddTaskDialog(true)
          }
        }}
      />

      {/* Add task from Task List */}
      <Dialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog}>
        <DialogContent className="map-panel new-task-panel max-w-sm p-4" showCloseButton={false} blurOverlay>
          <DialogHeader className="p-0 pb-3">
            <DialogTitle className="text-base">New Task</DialogTitle>
            <DialogDescription className="sr-only">Create a new task and assign it to a lead</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!addTaskFromLead ? (
            <div className="relative">
              <label className="text-xs font-medium text-gray-500 block mb-1">Assign to lead</label>
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
              <label className="text-xs font-medium text-gray-500 block mb-1">Task title</label>
              <Input
                value={addTaskTitle}
                onChange={(e) => setAddTaskTitle(e.target.value)}
                placeholder="e.g. Call back on Monday"
                className="text-sm"
                autoFocus={addTaskFromLead}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const t = addTaskTitle.trim()
                    if (t && addTaskLeadId) {
                      const scheduledAt = fromDatetimeLocal(addTaskScheduledAt)
                      addLeadTask(addTaskLeadId, t, scheduledAt)
                      refreshAllTasks()
                      scheduleSync()
                      showToast('Task added', 'success')
                      setShowAddTaskDialog(false)
                      const lead = displayLeads.find((l) => l.parcelId === addTaskLeadId)
                      if (lead) setSelectedLead(lead)
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer" htmlFor="add-task-schedule">
                <Calendar className="h-4 w-4 text-white opacity-90 hover:opacity-100" />
              </label>
              <input
                id="add-task-schedule"
                type="datetime-local"
                value={addTaskScheduledAt}
                onChange={(e) => setAddTaskScheduledAt(e.target.value)}
                min={toDatetimeLocal(Date.now())}
                className="sr-only absolute w-0 h-0 opacity-0"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  const t = addTaskTitle.trim()
                  if (t && addTaskLeadId) {
                    const scheduledAt = fromDatetimeLocal(addTaskScheduledAt)
                    addLeadTask(addTaskLeadId, t, scheduledAt)
                    refreshAllTasks()
                    scheduleSync()
                    showToast('Task added', 'success')
                    setShowAddTaskDialog(false)
                    const lead = displayLeads.find((l) => l.parcelId === addTaskLeadId)
                    if (lead) setSelectedLead(lead)
                  }
                }}
                disabled={!addTaskTitle.trim() || !addTaskLeadId}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddTaskDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
