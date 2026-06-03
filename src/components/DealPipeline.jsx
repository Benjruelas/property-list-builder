import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, Pencil, X, ArrowRight, Settings, ListTodo, CheckSquare, Square, ChevronDown, ChevronUp, Calendar, Eye, EyeOff, MoreVertical, Share2, Check, Users } from 'lucide-react'
import { Button } from './ui/button'
import { PanelBackButton, PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelOptionsButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange } from './ui/panelDialogUtils'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { loadColumns, saveColumns, loadDeals, saveDeals, loadTitle, saveTitle, formatTimeInState } from '@/utils/dealPipeline'
import { getAllTasks, getPersonalTasks, addTask, toggleLeadTask, updateLeadTaskSchedule, updateLeadTaskTitle, deleteLeadTask, deleteAllLeadTasks, formatTaskCompletedDate, formatTaskScheduledDate, taskBelongsToPipeline } from '@/utils/leadTasks'
import { addPipelineTask, updatePipelineTask, togglePipelineTask, removePipelineTask, flattenPipelineTasks } from '@/utils/pipelineTasks'
import { addTeamTask, updateTeamTask, removeTeamTask, toggleTeamTask } from '@/utils/teamTasks'
import { getAllTeamMembers, flattenTeamTasks, formatAssigneeList, shouldStoreAsTeamTask } from '@/utils/teamTaskUtils'
import { TeamMemberAssignSectionLight } from './TeamMemberAssignSection'
import { NewTaskDialog } from './NewTaskDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DealDetails } from './DealDetails'
import { LeadDetails } from './LeadDetails'
import { DealProfitBadge } from './DealLineItemsSection'
import { dealHasFinancials } from '@/utils/dealFinances'
import { SchedulePicker } from './SchedulePicker'
import { createPipeline, canCollaborateOnPipeline } from '@/utils/pipelines'
import { displayLeadName, updateLead } from '@/utils/leads'
import { ResourceSharePicker, VisibilityBadge } from './ResourceSharePicker'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'

const MAX_COLUMNS = 10
const PIPELINE_OPTIONS_MENU_W = 200
const PIPELINE_SWITCHER_MENU_W = 280
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

/** Left-align dropdown with anchor button; keep menu on-screen horizontally. */
function anchorMenuLeftAligned(rect, menuWidth) {
  const pad = 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  let left = rect.left
  if (left + menuWidth > vw - pad) left = Math.max(pad, vw - menuWidth - pad)
  if (left < pad) left = pad
  return { top: rect.bottom + 4, left }
}

function taskBelongsToLocalDeals(task, displayDeals) {
  const standalone = task.pipelineId == null && task.parcelId == null && task.dealId == null
  if (standalone) return false
  if (task.dealId && displayDeals.some((d) => d.id === task.dealId)) return true
  if (task.parcelId && displayDeals.some((d) => String(d.parcelId) === String(task.parcelId))) return true
  return false
}

function getDealCardLabels(deal, leads) {
  const title = (deal.title || '').trim() || 'Untitled deal'
  let leadName = (deal.leadName || '').trim()
  if (deal.leadId && leads?.length) {
    const lead = leads.find((l) => l.id === deal.leadId)
    if (lead) leadName = displayLeadName(lead)
  }
  return { title, leadName }
}

function leadToParcelData(lead) {
  if (!lead) return null
  return {
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
  }
}

export function DealPipeline({
  isOpen,
  instantDismiss = false,
  onClose,
  onBack,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onSkipTraceParcel,
  skipTracingInProgress,
  deals = [],
  onDealsChange,
  leads = [],
  onOpenCreateDeal,
  onOpenScheduleAtDate,
  pipelines = [],
  activePipelineId,
  onPipelinesChange,
  onActivePipelineChange,
  onSharePipeline,
  onSharePipelineWithTeams,
  teams = [],
  teamMembership = null,
  onDeletePipeline,
  onValidateShareEmail,
  currentUser,
  getToken,
  onColumnsChange,
  onTitleChange,
  focusDealId = null,
  pipesLeadOverlayId = null,
  onOpenDeal,
  onOpenLeadOverlay,
  onCloseDeal,
  onCloseLeadOverlay,
  addTaskRequestKey = 0,
  addTaskRequestParcelId = null,
  onAddTaskRequestHandled,
  onRequestMoveDeal,
  onRequestRemoveDeal,
  onRequestCloseDeal,
  onGoToParcelOnMap,
  onLeadsChange,
  onRefreshLeads,
  onCreateQuoteForDeal,
  canSeeDealAmounts = true,
}) {
  const { scheduleSync } = useUserDataSync()
  const apiMode = pipelines.length > 0
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) || pipelines[0]
  const [columns, setColumns] = useState([])
  const [localDeals, setLocalDeals] = useState([])
  const [optimisticDeals, setOptimisticDeals] = useState(null)
  const displayDeals = optimisticDeals ?? (onDealsChange ? deals : localDeals)
  const [editingColumnId, setEditingColumnId] = useState(null)
  const [editingColumnName, setEditingColumnName] = useState('')
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [draggedDealId, setDraggedDealId] = useState(null)
  const [dragOverColId, setDragOverColId] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [pipelineTitle, setPipelineTitle] = useState('Pipes')
  const leadOverlayId = pipesLeadOverlayId
  const selectedDeal = useMemo(() => {
    if (!focusDealId) return null
    return displayDeals.find((d) => d.id === focusDealId || String(d.parcelId) === String(focusDealId)) ?? null
  }, [focusDealId, displayDeals])
  const [allTasks, setAllTasks] = useState([])
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false)
  const [addTaskPrefill, setAddTaskPrefill] = useState(null)
  const [editTaskAssignUids, setEditTaskAssignUids] = useState([])
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
  const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(false)
  const [pipelineSwitcherOpen, setPipelineSwitcherOpen] = useState(false)
  const [pipelineSwitcherAnchor, setPipelineSwitcherAnchor] = useState(null)
  const [createPipelineDialogOpen, setCreatePipelineDialogOpen] = useState(false)
  const [newPipelineTitle, setNewPipelineTitle] = useState('')
  const [sharePipelineId, setSharePipelineId] = useState(null)
  const [localShareState, setLocalShareState] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const validateShareTimeoutRef = useRef(null)
  const justDraggedRef = useRef(false)

  const isPipelineOwnedByUser = (p) => p?.ownerId === currentUser?.uid

  /** Owner or collaborator: may move leads and use tasks; structure/sharing remains owner-only (API + UI). */
  const canCollaboratePipeline = useMemo(() => {
    if (!apiMode) return true
    if (!activePipeline) return false
    return canCollaborateOnPipeline(currentUser, activePipeline)
  }, [apiMode, activePipeline, currentUser])

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

  useEffect(() => {
    if (!sharePipelineId) {
      setLocalShareState(null)
      return
    }
    const pipe = pipelines.find((p) => p.id === sharePipelineId)
    const norm = normalizeResourceVisibility(pipe || {})
    setLocalShareState({
      visibility: norm.visibility || VISIBILITY.PRIVATE,
      sharedMemberUids: norm.sharedMemberUids || [],
    })
  }, [sharePipelineId, pipelines])

  const handlePipelineShareChange = useCallback(
    (next) => {
      if (!onSharePipelineWithTeams || !sharePipelineId) return
      setLocalShareState(next)
      void (async () => {
        try {
          await onSharePipelineWithTeams(sharePipelineId, next)
        } catch (e) {
          const pipe = pipelines.find((p) => p.id === sharePipelineId)
          const norm = normalizeResourceVisibility(pipe || {})
          setLocalShareState({
            visibility: norm.visibility || VISIBILITY.PRIVATE,
            sharedMemberUids: norm.sharedMemberUids || [],
          })
          showToast(e.message || 'Failed to update sharing', 'error')
        }
      })()
    },
    [onSharePipelineWithTeams, sharePipelineId, pipelines]
  )

  const refreshAllTasks = useCallback(() => {
    // Personal tasks = local leadTasks store with no pipelineId (tasks with a
    // pipelineId now live on the pipeline doc; legacy rows are migrated away
    // on first load in App.jsx). Pipeline tasks are flattened from
    // pipelines[].tasks which are fetched by /api/pipelines (access-filtered).
    const personal = apiMode ? getPersonalTasks() : getAllTasks()
    const pipeScoped = apiMode ? flattenPipelineTasks(pipelines) : []
    const teamScoped = apiMode ? flattenTeamTasks(pipelines) : []
    setAllTasks([...personal, ...pipeScoped, ...teamScoped])
  }, [apiMode, pipelines])

  useEffect(() => {
    if (!focusDealId) refreshAllTasks()
  }, [focusDealId, refreshAllTasks])

  const leadOverlay = leadOverlayId ? leads.find((l) => l.id === leadOverlayId) : null

  const openLeadFromDeal = useCallback((lead) => {
    if (!lead?.id) return
    if (leadOverlayId === lead.id) return
    onOpenLeadOverlay?.(lead.id)
  }, [leadOverlayId, onOpenLeadOverlay])

  const handleGoToParcelOnMap = useCallback((data) => {
    onCloseLeadOverlay?.()
    onCloseDeal?.()
    onGoToParcelOnMap?.(data)
  }, [onGoToParcelOnMap, onCloseLeadOverlay, onCloseDeal])

  const handleLeadUpdate = useCallback(async (updated) => {
    try {
      const saved = await updateLead(getToken, updated.id, updated)
      onLeadsChange?.(leads.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, leads, onLeadsChange])

  // External callers (Leads list, Schedule) request the in-board New Task
  // dialog prefilled for a specific lead. Mirror the focus-lead pattern so
  // the same state machine handles both.
  useEffect(() => {
    if (!isOpen || !addTaskRequestKey) return
    if (addTaskRequestParcelId == null || addTaskRequestParcelId === '') return
    const id = window.setTimeout(() => {
      const deal = displayDeals.find((d) => String(d.parcelId) === String(addTaskRequestParcelId))
      if (deal) {
        const startOfHour = new Date()
        startOfHour.setMinutes(0, 0, 0)
        const startTs = startOfHour.getTime()
        const leadId =
          deal.leadId ||
          (deal.parcelId
            ? (leads || []).find((l) => String(l.parcelId) === String(deal.parcelId))?.id
            : null) ||
          null
        setAddTaskPrefill({
          dealId: deal.id,
          leadId,
          scheduledAt: startTs,
          scheduledEndAt: startTs + 60 * 60 * 1000,
          dateTimeExpanded: true,
          disableDealClear: true,
        })
        setShowAddTaskDialog(true)
      }
      onAddTaskRequestHandled?.()
    }, 120)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, addTaskRequestKey, addTaskRequestParcelId, displayDeals])

  useEffect(() => {
    if (isOpen) {
      if (apiMode && activePipeline) {
        setColumns(activePipeline.columns || [])
        setPipelineTitle(activePipeline.title || 'Pipes')
      } else {
        setColumns(loadColumns())
        setPipelineTitle(loadTitle())
        let lsDeals = loadDeals()
        const needsMigration = lsDeals.some(d =>
          (d.statusEnteredAt == null && d.createdAt != null) || (d.cumulativeTimeByStatus == null)
        )
        if (needsMigration) {
          lsDeals = lsDeals.map(d => ({
            ...d,
            statusEnteredAt: d.statusEnteredAt ?? d.createdAt ?? Date.now(),
            cumulativeTimeByStatus: d.cumulativeTimeByStatus || {},
          }))
          saveDeals(lsDeals)
          if (onDealsChange) onDealsChange(lsDeals)
          scheduleSync()
        }
        if (!onDealsChange) setLocalDeals(lsDeals)
      }
      refreshAllTasks()
    }
  }, [isOpen, onDealsChange, scheduleSync, refreshAllTasks, apiMode, activePipeline])

  const persistColumns = useCallback((cols) => {
    setColumns(cols)
    if (apiMode && onColumnsChange) {
      onColumnsChange(cols)
    } else {
      saveColumns(cols)
      scheduleSync()
    }
  }, [scheduleSync, apiMode, onColumnsChange])

  const persistDeals = useCallback(
    (d) => {
      if (apiMode && !canCollaboratePipeline) {
        showToast('You cannot update deals on this pipeline', 'error')
        return
      }
      if (apiMode && onDealsChange) {
        setOptimisticDeals(d)
        onDealsChange(d).then(() => setOptimisticDeals(null)).catch(() => setOptimisticDeals(null))
      } else {
        setLocalDeals(d)
        saveDeals(d)
        scheduleSync()
      }
    },
    [scheduleSync, apiMode, onDealsChange, canCollaboratePipeline]
  )

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
    const count = displayDeals.filter(d => d.status === colId).length
    const message = count > 0
      ? `Delete "${col?.name}"? ${count} deal(s) will be moved to the first column.`
      : `Delete "${col?.name}"?`
    const confirmed = await showConfirm(message, 'Delete column')
    if (!confirmed) return
    const firstColId = columns[0]?.id
    const now = Date.now()
    const updatedDeals = displayDeals.map(d => {
      if (d.status !== colId) return d
      const entered = d.statusEnteredAt ?? d.createdAt ?? now
      const stintMs = Math.max(0, now - entered)
      const cum = { ...(d.cumulativeTimeByStatus || {}) }
      cum[colId] = (cum[colId] || 0) + stintMs
      return { ...d, status: firstColId || colId, statusEnteredAt: now, cumulativeTimeByStatus: cum }
    })
    persistDeals(updatedDeals)
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

  const handleDeleteDeal = async (dealId, e) => {
    e?.stopPropagation()
    const deal = displayDeals.find((d) => d.id === dealId)
    const dealLabel = deal ? (deal.title || deal.leadName || deal.leadAddress || 'Unknown') : 'Unknown'
    const confirmed = await showConfirm('Remove this deal from the pipeline?', 'Remove deal', { detail: dealLabel })
    if (!confirmed) return
    if (apiMode && !canCollaboratePipeline) {
      persistDeals(displayDeals.filter(d => d.id !== dealId))
      return
    }
    if (selectedDeal?.id === dealId) onCloseDeal?.()
    persistDeals(displayDeals.filter(d => d.id !== dealId))

    const parcelId = deal?.parcelId
    if (parcelId) {
      if (apiMode && activePipeline) {
        const pipelineTasksForDeal = (activePipeline.tasks || []).filter((t) => t?.parcelId === parcelId || t?.dealId === dealId)
        let removedAny = false
        for (const t of pipelineTasksForDeal) {
          try {
            await removePipelineTask(getToken, activePipeline.id, t.id)
            removedAny = true
          } catch { /* non-fatal */ }
        }
        if (removedAny) {
          try { await onPipelinesChange?.() } catch { /* non-fatal */ }
        }
      } else {
        deleteAllLeadTasks(parcelId, null)
        refreshAllTasks()
        scheduleSync()
      }
    }

    showToast('Deal removed', 'success')
  }

  const handleMoveDeal = (dealId, newStatus) => {
    const now = Date.now()
    persistDeals(displayDeals.map(d => {
      if (d.id !== dealId) return d
      if (d.status === newStatus) return d
      const entered = d.statusEnteredAt ?? d.createdAt ?? now
      const stintMs = Math.max(0, now - entered)
      const cum = { ...(d.cumulativeTimeByStatus || {}) }
      cum[d.status] = (cum[d.status] || 0) + stintMs
      return { ...d, status: newStatus, statusEnteredAt: now, cumulativeTimeByStatus: cum }
    }))
  }

  const handleMoveToNext = (dealId) => {
    const deal = displayDeals.find(d => d.id === dealId)
    if (!deal) return
    const idx = columns.findIndex(c => c.id === deal.status)
    if (idx < 0 || idx >= columns.length - 1) return
    handleMoveDeal(dealId, columns[idx + 1].id)
  }

  const handleDragStart = (e, dealId) => {
    setDraggedDealId(dealId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dealId)
  }

  const handleDragEnd = () => {
    setDraggedDealId(null)
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
    const dealId = e.dataTransfer.getData('text/plain')
    if (dealId) handleMoveDeal(dealId, colId)
    setDraggedDealId(null)
    setDragOverColId(null)
  }

  const getDealsForColumn = (colId) => displayDeals.filter(d => d.status === colId)

  const openDealFromTask = (task) => {
    if (task.dealId) {
      const deal = displayDeals.find((d) => d.id === task.dealId)
      if (deal) { onOpenDeal?.(deal.id); return }
    }
    if (task.parcelId) {
      const deal = displayDeals.find((d) => String(d.parcelId) === String(task.parcelId))
      if (deal) { onOpenDeal?.(deal.id); return }
    }
    if (task.__source === 'team' && task.leadId) {
      const deal = displayDeals.find((d) => d.leadId === task.leadId)
      if (deal) onOpenDeal?.(deal.id)
    }
  }

  const handleDealClick = (deal) => {
    if (justDraggedRef.current) return
    onOpenDeal?.(deal.id)
  }

  const toggleEditMode = () => {
    setIsEditMode((prev) => {
      if (prev) {
        setEditingColumnId(null)
        setShowAddColumn(false)
        setNewColumnName('')
        const trimmed = pipelineTitle.trim() || 'Pipes'
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
    const trimmed = pipelineTitle.trim() || 'Pipes'
    setPipelineTitle(trimmed)
    if (apiMode && onTitleChange) {
      onTitleChange(trimmed)
    } else {
      saveTitle(trimmed)
      scheduleSync()
    }
  }

  const displayTasks = useMemo(() => {
    if (apiMode) {
      return allTasks.filter((t) => taskBelongsToPipeline(t, activePipelineId, pipelines))
    }
    return allTasks.filter((t) => taskBelongsToLocalDeals(t, displayDeals))
  }, [allTasks, apiMode, activePipelineId, pipelines, displayDeals])

  const hasPipeTasks = displayTasks.length > 0

  const getDealLabel = (dealId, parcelId) => {
    if (dealId) {
      const deal = displayDeals.find((d) => d.id === dealId)
      if (deal) return deal.title || deal.leadName || deal.leadAddress || dealId
    }
    if (parcelId) {
      const deal = displayDeals.find((d) => String(d.parcelId) === String(parcelId))
      if (deal) return deal.title || deal.leadName || deal.leadAddress || parcelId
    }
    if (!dealId && !parcelId) return 'Pipeline task'
    return dealId || parcelId
  }

  const commitNewTask = useCallback(
    async ({ title, scheduledAt, scheduledEndAt, assignedUids = [], leadId: addTaskLeadId, dealId: addTaskDealId }) => {
      const trimmed = (title || '').toString().trim()
      if (!trimmed) return
      const deal = addTaskDealId ? displayDeals.find((d) => d.id === addTaskDealId) : null
      const selectedLead = addTaskLeadId ? (leads || []).find((l) => l.id === addTaskLeadId) : null
      const leadId = addTaskLeadId || deal?.leadId || null
      const parcelId = deal?.parcelId || selectedLead?.parcelId || null
      if (assignedUids.length > 0 && !leadId) {
        showToast('Assign a deal or lead to notify teammates', 'error')
        return
      }
      if (apiMode && activePipelineId && shouldStoreAsTeamTask(activePipeline, { assignedUids, leadId })) {
        try {
          await addTeamTask(getToken, activePipelineId, leadId, {
            title: trimmed,
            dueAt: scheduledAt,
            assignedUids,
            dealId: deal?.id || null,
          })
          await onPipelinesChange?.()
          showToast('Task added', 'success')
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      } else if (apiMode && activePipelineId) {
        try {
          await addPipelineTask(getToken, activePipelineId, {
            title: trimmed,
            parcelId,
            dealId: deal?.id || null,
            scheduledAt,
            scheduledEndAt,
          })
          await onPipelinesChange?.()
          showToast('Task added', 'success')
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      } else {
        addTask({
          pipelineId: null,
          parcelId,
          title: trimmed,
          scheduledAt,
          scheduledEndAt,
        })
        refreshAllTasks()
        scheduleSync()
        showToast('Task added', 'success')
      }
      setShowAddTaskDialog(false)
      setAddTaskPrefill(null)
      if (deal) onOpenDeal?.(deal.id)
    },
    [
      apiMode,
      activePipelineId,
      activePipeline,
      getToken,
      onPipelinesChange,
      refreshAllTasks,
      scheduleSync,
      displayDeals,
      leads,
      onOpenDeal,
    ]
  )

  const commitEditTask = useCallback(async (title) => {
    const trimmed = (title || '').toString().trim()
    if (!trimmed || !editTask?.task) return
    const task = editTask.task
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await updateTeamTask(getToken, task.pipelineId, task.leadId, {
          id: task.id,
          title: trimmed,
          dueAt: editTaskScheduledAt,
          assignedUids: editTaskAssignUids
        })
        await onPipelinesChange?.()
        showToast('Task updated', 'success')
        setEditTask(null)
        setEditTaskAssignUids([])
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      return
    }
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await updatePipelineTask(getToken, task.pipelineId, {
          id: task.id,
          title: trimmed,
          scheduledAt: editTaskScheduledAt,
          scheduledEndAt: editTaskScheduledEndAt
        })
        await onPipelinesChange?.()
        showToast('Task updated', 'success')
        setEditTask(null)
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      return
    }
    updateLeadTaskTitle(task.parcelId, task.id, trimmed)
    updateLeadTaskSchedule(task.parcelId, task.id, editTaskScheduledAt, editTaskScheduledEndAt)
    refreshAllTasks()
    scheduleSync()
    showToast('Task updated', 'success')
    setEditTask(null)
  }, [editTask, editTaskScheduledAt, editTaskScheduledEndAt, editTaskAssignUids, getToken, onPipelinesChange, refreshAllTasks, scheduleSync])

  const newTaskTeamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const resetPipelineUi = () => {
    setIsEditMode(false)
    setEditingColumnId(null)
    setShowAddColumn(false)
    setTaskMenu(null)
    setPipelineDropdownOpen(false)
    setPipelineSwitcherOpen(false)
    setSharePipelineId(null)
  }

  const hasNestedDetail = !!(focusDealId || leadOverlayId)

  const handlePipelineBack = () => {
    if (leadOverlayId) {
      onCloseLeadOverlay?.()
      return
    }
    if (selectedDeal || focusDealId) {
      onCloseDeal?.()
      return
    }
    resetPipelineUi()
    onBack?.() ?? onClose?.()
  }

  const handleDealClose = () => {
    onCloseDeal?.()
  }

  const handleLeadOverlayClose = () => {
    onCloseLeadOverlay?.()
  }

  return (
    <Dialog open={isOpen} modal={!hasNestedDetail} onOpenChange={(o) => handlePanelDialogOpenChange(o, hasNestedDetail, handlePipelineBack)}>
      <DialogContent
        className="map-panel deal-pipeline-panel fullscreen-panel flex flex-col"
        showCloseButton={false}
        hideOverlay
        suppressBackdrop={hasNestedDetail}
        instantDismiss={instantDismiss && !isOpen}
        onInteractOutside={(e) => {
          if (e.target?.closest?.('[data-pipeline-dropdown]') || e.target?.closest?.('[data-pipeline-switcher]') || e.target?.closest?.('[data-share-pipeline-dialog]') || e.target?.closest?.('[data-create-pipeline-dialog]')) e.preventDefault()
        }}
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-3')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Manage deals in your pipe</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <PanelBackButton
                onClick={handlePipelineBack}
                className="pipeline-icon-btn"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
              {isEditMode ? (
                <Input
                  value={pipelineTitle}
                  onChange={(e) => setPipelineTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  className="h-9 min-w-0 flex-1 border-gray-300 text-xl font-semibold"
                  placeholder="Pipeline title"
                />
              ) : (
                <DialogTitle className="min-w-0 truncate text-xl font-semibold">{pipelineTitle}</DialogTitle>
              )}
              {apiMode && pipelines.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 shrink-0 pipeline-icon-btn ${pipelineSwitcherOpen ? 'opacity-90' : ''}`}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setPipelineSwitcherAnchor(anchorMenuLeftAligned(rect, PIPELINE_SWITCHER_MENU_W))
                    setPipelineSwitcherOpen((o) => !o)
                    setPipelineDropdownOpen(false)
                  }}
                  title="Switch pipeline"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              )}
                </div>
              </div>
            </div>
            <div className="map-panel-header-actions">
              {apiMode && onSharePipeline && isPipelineOwnedByUser(activePipeline) ? (
                <PanelOptionsButton
                  className="pipeline-icon-btn"
                  title="Pipeline options"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setPipelineDropdownAnchor(anchorMenuLeftAligned(rect, PIPELINE_OPTIONS_MENU_W))
                    setPipelineDropdownOpen(true)
                    setPipelineSwitcherOpen(false)
                  }}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 shrink-0 pipeline-icon-btn deal-pipeline-settings-btn ${isEditMode ? 'deal-pipeline-edit-active' : ''} ${apiMode && !isPipelineOwnedByUser(activePipeline) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !apiMode || isPipelineOwnedByUser(activePipeline) ? toggleEditMode() : null}
                  title={apiMode && !isPipelineOwnedByUser(activePipeline) ? 'Edit mode disabled for shared pipelines' : (isEditMode ? 'Exit edit mode' : 'Edit pipeline')}
                  disabled={apiMode && !isPipelineOwnedByUser(activePipeline)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden deal-pipeline-content">
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide px-6 pt-0 pb-3 min-w-0 min-h-0 deal-pipeline-columns">
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
                  onDragOver={canCollaboratePipeline ? (e) => handleDragOver(e, col.id) : undefined}
                  onDragLeave={canCollaboratePipeline ? handleDragLeave : undefined}
                  onDrop={canCollaboratePipeline ? (e) => handleDrop(e, col.id) : undefined}
                >
                  {getDealsForColumn(col.id).map((deal) => (
                    <div
                      key={deal.id}
                      draggable={canCollaboratePipeline}
                      onDragStart={canCollaboratePipeline ? (e) => handleDragStart(e, deal.id) : undefined}
                      onDragEnd={canCollaboratePipeline ? handleDragEnd : undefined}
                      onClick={() => handleDealClick(deal)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleDealClick(deal)}
                      className={`deal-pipeline-lead-card map-panel-list-item px-2 py-1.5 rounded-md border border-white/10 text-white text-xs group flex items-center gap-1 transition-colors ${canCollaboratePipeline ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedDealId === deal.id ? 'opacity-50' : ''}`}
                      style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                    >
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const { title, leadName } = getDealCardLabels(deal, leads)
                          return (
                            <>
                              <div className="font-medium truncate text-white" title={title}>
                                {title}
                              </div>
                              {leadName && (
                                <div className="text-[11px] truncate text-white/85" title={leadName}>
                                  {leadName}
                                </div>
                              )}
                            </>
                          )
                        })()}
                        {(() => {
                          const duration = formatTimeInState(deal)
                          const hasProfit = canSeeDealAmounts && dealHasFinancials(deal)
                          if (!duration && !hasProfit) return null
                          return (
                            <div className="text-[10px] mt-0.5 text-white/75 flex items-center gap-2 flex-wrap">
                              {duration && <span title="Cumulative time in this stage">{duration}</span>}
                              {hasProfit && <DealProfitBadge deal={deal} className="text-[10px]" canSeeDealAmounts={canSeeDealAmounts} />}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 text-white/90">
                        {isEditMode ? (
                          <button type="button" className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 text-red-400 hover:text-red-300" onClick={(e) => handleDeleteDeal(deal.id, e)} title="Remove deal">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="pipeline-icon-btn p-0.5 -m-0.5 rounded opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed text-white/90"
                            onClick={(e) => { e.stopPropagation(); handleMoveToNext(deal.id) }}
                            title="Move to next stage"
                            disabled={!canCollaboratePipeline || columns.findIndex(c => c.id === deal.status) >= columns.length - 1}
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

          {/* Tasks - collapsible; mobile: pinned bottom, expands upward; desktop: right sidebar */}
          <div
            className={cn(
              'w-full flex flex-col border-t md:border-t-0 md:border-l border-white/20 transition-[width] duration-200 deal-pipeline-tasks',
              'max-lg:mt-auto max-lg:flex-shrink-0 max-lg:flex-col-reverse',
              tasksCollapsed ? 'md:w-16' : 'md:w-80 md:self-start h-auto',
            )}
          >
            <div
              className={cn(
                'deal-pipeline-tasks-header px-3 py-2 flex items-center gap-2 flex-shrink-0 min-h-[44px]',
                'border-white/20 max-lg:border-t max-lg:border-b-0 border-b',
                tasksCollapsed ? 'md:flex-row md:px-2 md:py-3 md:justify-between md:min-h-[48px]' : 'justify-between',
              )}
            >
              <button
                type="button"
                className={`flex items-center min-w-0 flex-1 md:flex-none pipeline-icon-btn ${tasksCollapsed ? 'md:justify-between md:w-full md:px-1' : 'gap-2'}`}
                onClick={() => setTasksCollapsed(!tasksCollapsed)}
                title={tasksCollapsed ? 'Expand tasks' : 'Collapse tasks'}
              >
                {tasksCollapsed ? (
                  <>
                    <span className="hidden md:inline opacity-70 order-first flex-shrink-0">
                      <ChevronUp className="h-4 w-4 rotate-[-90deg]" />
                    </span>
                    <span className="hidden md:inline flex-shrink-0 order-last"><ListTodo className="h-4 w-4" /></span>
                    <span className="md:hidden flex items-center gap-2">
                      <ListTodo className="h-4 w-4 flex-shrink-0" />
                      <span className="font-semibold text-sm truncate">Tasks</span>
                      {tasksCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </span>
                  </>
                ) : (
                  <>
                    <ListTodo className="h-4 w-4 flex-shrink-0" />
                    <span className="font-semibold text-sm truncate">Tasks</span>
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
                  setAddTaskPrefill(null)
                  setShowAddTaskDialog(true)
                }}
                title="Add task"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              </div>
              )}
            </div>
            {hasPipeTasks && !tasksCollapsed && (
            <div
              className={cn(
                'scrollbar-hide p-2 space-y-3 max-md:space-y-1.5 max-md:p-1.5 border-white/10 overflow-y-auto',
                'max-lg:border-b border-white/10',
                'max-h-[min(50vh,calc(var(--vw-height,100vh)-10rem))] md:max-h-[min(70vh,calc(var(--vw-height,100vh)-10rem))]',
              )}
            >
              {(() => {
                    const filtered = showCompletedTasks ? displayTasks : displayTasks.filter((t) => !t.completed)
                    const scheduled = filtered.filter((t) => t.scheduledAt)
                    const unscheduled = filtered.filter((t) => !t.scheduledAt)
                    const TaskItem = ({ task }) => (
                  <div
                    className={`text-xs map-panel-list-item rounded-md p-2 max-md:p-1.5 cursor-pointer transition-colors border border-solid ${task.completed ? 'opacity-60 border-white/[0.08] bg-white/[0.04] hover:opacity-90 hover:bg-white/[0.07]' : 'border-white/10 bg-white/[0.06] hover:bg-white/10'}`}
                    onClick={() => openDealFromTask(task)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') openDealFromTask(task) }}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (task.__source === 'team' && task.pipelineId && task.leadId) {
                            try {
                              await toggleTeamTask(getToken, task.pipelineId, task.leadId, task.id)
                              onPipelinesChange?.()
                            } catch (err) {
                              showToast(err.message || 'Failed to update task', 'error')
                            }
                          } else if (task.__source === 'pipeline' && task.pipelineId) {
                            try {
                              await togglePipelineTask(getToken, task.pipelineId, task.id)
                              onPipelinesChange?.()
                            } catch (err) {
                              showToast(err.message || 'Failed to update task', 'error')
                            }
                          } else {
                            toggleLeadTask(task.parcelId, task.id)
                            refreshAllTasks()
                            scheduleSync()
                          }
                        }}
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
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className={task.completed ? 'line-through text-gray-500' : 'font-medium'}>
                            {task.title || '(untitled)'}
                          </span>
                          {task.__source === 'team' && (
                            <span className="text-[9px] font-medium px-1 py-0 rounded bg-blue-100/90 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200 uppercase">
                              Team
                            </span>
                          )}
                        </div>
                        {(task.dealId || task.parcelId) && (
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={getDealLabel(task.dealId, task.parcelId)}>Deal: {getDealLabel(task.dealId, task.parcelId)}</div>
                        )}
                        {task.__source === 'team' && formatAssigneeList(task.assignedUids, teams) && (
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={formatAssigneeList(task.assignedUids, teams)}>
                            {formatAssigneeList(task.assignedUids, teams)}
                          </div>
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
                                {scheduled.map((task) => <TaskItem key={`${task.id}-${task.__source || 'p'}`} task={task} />)}
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
                                {unscheduled.map((task) => <TaskItem key={`${task.id}-${task.__source || 'p'}`} task={task} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
            </div>
            )}
          </div>
        </div>
      </DialogContent>

      {isOpen && selectedDeal && (
        <DealDetails
          instantDismiss={instantDismiss}
          deal={selectedDeal}
          pipeline={activePipeline}
          lead={leads.find((l) => l.id === selectedDeal.leadId) || null}
          pipelines={pipelines}
          leads={leads}
          teams={teams}
          onPipelinesChange={onPipelinesChange}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onOpenLead={openLeadFromDeal}
          leadLinkActive={!!leadOverlayId && leadOverlayId === selectedDeal.leadId}
          onClose={handleDealClose}
          onDealUpdate={(updated) => {
            persistDeals(displayDeals.map(d => d.id === updated.id ? updated : d))
          }}
          onRequestMoveDeal={onRequestMoveDeal}
          onRequestCloseDeal={async (deal, pipeline) => {
            const ok = await onRequestCloseDeal?.(deal, pipeline)
            if (ok) {
              onCloseDeal?.()
              onCloseLeadOverlay?.()
            }
          }}
          onRequestRemoveDeal={async (deal, pipeline) => {
            const ok = await onRequestRemoveDeal?.(deal, pipeline)
            if (ok) {
              onCloseDeal?.()
              onCloseLeadOverlay?.()
            }
          }}
          getToken={getToken}
          onCreateQuoteForDeal={onCreateQuoteForDeal}
          canSeeDealAmounts={canSeeDealAmounts}
        />
      )}

      {isOpen && leadOverlay && (
        <LeadDetails
          isOpen
          instantDismiss={instantDismiss}
          onClose={handleLeadOverlayClose}
          lead={leadOverlay}
          pipelines={pipelines}
          getToken={getToken}
          parcelData={leadToParcelData(leadOverlay)}
          onOpenParcelDetails={onOpenParcelDetails}
          onEmailClick={onEmailClick}
          onPhoneClick={onPhoneClick}
          onGoToParcelOnMap={handleGoToParcelOnMap}
          onLeadUpdate={handleLeadUpdate}
          onCreateDeal={onOpenCreateDeal}
          onOpenDeal={(deal) => {
            onCloseLeadOverlay?.()
            onOpenDeal?.(deal.id)
          }}
          onLeadDeleted={() => {
            onCloseLeadOverlay?.()
            onRefreshLeads?.()
          }}
          onOpenScheduleAtDate={onOpenScheduleAtDate}
          onPipelinesChange={onPipelinesChange}
          teams={teams}
          teamMembership={teamMembership}
          leads={leads}
          canSeeDealAmounts={canSeeDealAmounts}
          nestedOverlay
          topLayer
        />
      )}

      <NewTaskDialog
        open={showAddTaskDialog}
        onOpenChange={(open) => {
          setShowAddTaskDialog(open)
          if (!open) setAddTaskPrefill(null)
        }}
        leads={leads || []}
        deals={displayDeals}
        showDealPicker
        initialLeadId={addTaskPrefill?.leadId ?? null}
        initialDealId={addTaskPrefill?.dealId ?? null}
        initialScheduledAt={addTaskPrefill?.scheduledAt ?? null}
        initialScheduledEndAt={addTaskPrefill?.scheduledEndAt ?? null}
        initialDateTimeExpanded={addTaskPrefill?.dateTimeExpanded ?? false}
        disableDealClear={!!addTaskPrefill?.disableDealClear}
        showTeamAssign={newTaskTeamMembers.length > 0}
        teamMembers={newTaskTeamMembers}
        onSubmit={commitNewTask}
        nestedOverlay
      />

      {/* Edit Task dialog */}
      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent
          className="map-panel list-panel new-task-panel !flex !max-w-md w-[min(92vw,24rem)] max-h-[min(92vh,900px)] min-h-[min(68vh,560px)] flex-col gap-0 p-0 !rounded-2xl"
          showCloseButton={false}
          nestedOverlay
        >
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-white/20">
            <DialogTitle className="text-xl font-semibold">Edit Task</DialogTitle>
            <DialogDescription className="sr-only">Edit task details</DialogDescription>
          </DialogHeader>
          {editTask && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 scrollbar-hide create-list-form">
              {(editTask.task.dealId || editTask.task.parcelId) ? (
                <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95 space-y-1">
                  {(() => {
                    const deal = editTask.deal || displayDeals.find((d) => d.id === editTask.task.dealId || String(d.parcelId) === String(editTask.task.parcelId))
                    const name = (deal?.leadName || '').toString().trim()
                    const address = (deal?.leadAddress || '').toString().trim()
                    const fallback = getDealLabel(editTask.task.dealId, editTask.task.parcelId) || 'Unknown'
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
              ) : (
                <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95">
                  <span className="text-[10px] uppercase text-white/70">Scope</span>
                  <div className="truncate">Pipeline task (no deal)</div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1 opacity-90">Title</label>
                <Input
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  placeholder="e.g. Call back on Monday"
                  className="text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const t = editTaskTitle.trim()
                      if (t) await commitEditTask(t)
                    }
                  }}
                />
              </div>
              <SchedulePicker
                inline
                value={editTaskScheduledAt}
                onChange={setEditTaskScheduledAt}
                endValue={editTask.task?.__source === 'team' ? null : editTaskScheduledEndAt}
                onEndChange={editTask.task?.__source === 'team' ? undefined : setEditTaskScheduledEndAt}
                minDate={Date.now()}
              />
              {editTask.task?.__source === 'team' && (activePipeline?.teamShares || []).length > 0 && (
                <TeamMemberAssignSectionLight
                  members={newTaskTeamMembers}
                  selectedUids={editTaskAssignUids}
                  onToggle={(uid) => {
                    setEditTaskAssignUids((prev) =>
                      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
                    )
                  }}
                />
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="create-list-btn flex-1"
                  onClick={async () => {
                    const t = editTaskTitle.trim()
                    if (t) await commitEditTask(t)
                  }}
                  disabled={!editTaskTitle.trim()}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="create-list-btn flex-1"
                  onClick={() => {
                    setEditTaskAssignUids([])
                    setEditTask(null)
                  }}
                >
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
              const shareState = localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
              const activeTeam = teams?.[0] || null
              const allowExternalSharing = teamMembership?.allowExternalSharing === true
              return (
                <>
                  {onSharePipelineWithTeams && activeTeam && (
                    <ResourceSharePicker
                      team={activeTeam}
                      visibility={shareState.visibility}
                      sharedMemberUids={shareState.sharedMemberUids}
                      onChange={handlePipelineShareChange}
                      allowExternalSharing={allowExternalSharing}
                    />
                  )}
                  {allowExternalSharing && isShared && (
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
                  {allowExternalSharing && (
                    <>
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
                  )}
                  {!allowExternalSharing && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      <Button variant="outline" onClick={() => { setSharePipelineId(null); setShareEmail(''); setShareEmailValid(null); setShareEmailError('') }} className="flex-1 min-w-0 share-dialog-btn">Done</Button>
                    </div>
                  )}
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}

      {createPipelineDialogOpen && (
        <Dialog open={createPipelineDialogOpen} onOpenChange={(open) => { if (!open) { setCreatePipelineDialogOpen(false); setNewPipelineTitle('') } }}>
          <DialogContent className="map-panel list-panel share-list-dialog max-w-sm" focusOverlay data-create-pipeline-dialog>
            <DialogHeader>
              <DialogTitle>New pipeline</DialogTitle>
              <DialogDescription className="sr-only">Name your new pipe</DialogDescription>
            </DialogHeader>
            <Input
              value={newPipelineTitle}
              onChange={(e) => setNewPipelineTitle(e.target.value)}
              placeholder="Pipeline name"
              className="mb-4"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                className="flex-1 share-dialog-btn"
                onClick={async () => {
                  try {
                    const title = newPipelineTitle.trim() || 'Pipes'
                    const created = await createPipeline(getToken, { title })
                    if (onPipelinesChange) await onPipelinesChange()
                    onActivePipelineChange?.(created.id)
                    setCreatePipelineDialogOpen(false)
                    setNewPipelineTitle('')
                    showToast('Pipeline created', 'success')
                  } catch (err) {
                    showToast(err.message || 'Could not create pipeline', 'error')
                  }
                }}
              >
                Create
              </Button>
              <Button
                variant="outline"
                className="flex-1 share-dialog-btn"
                onClick={() => { setCreatePipelineDialogOpen(false); setNewPipelineTitle('') }}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {pipelineSwitcherOpen && pipelineSwitcherAnchor && apiMode && typeof document !== 'undefined' && createPortal(
        <div data-pipeline-switcher className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setPipelineSwitcherOpen(false)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-xl min-w-[220px] max-w-[min(90vw,320px)] max-h-[min(50vh,280px)] overflow-y-auto py-1 shadow-xl border border-white/15"
            style={{ top: pipelineSwitcherAnchor.top, left: pipelineSwitcherAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onActivePipelineChange?.(p.id)
                  setPipelineSwitcherOpen(false)
                }}
                className="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors text-white/95"
              >
                {p.id === activePipelineId ? (
                  <Check className="h-4 w-4 flex-shrink-0 text-amber-400" aria-hidden />
                ) : (
                  <span className="w-4 flex-shrink-0 inline-block" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-medium text-left">{p.title?.trim() || 'Pipes'}</span>
                  {p.ownerId !== currentUser?.uid && (
                    <Users className="h-3.5 w-3.5 flex-shrink-0 text-white/70" title="Shared with you" aria-hidden />
                  )}
                  <VisibilityBadge resource={p} />
                </div>
              </button>
            ))}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPipelineSwitcherOpen(false)
                  setNewPipelineTitle('')
                  setCreatePipelineDialogOpen(true)
                }}
                className="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors text-white/95"
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                Create new pipeline
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root') || document.body
      )}

      {pipelineDropdownOpen && pipelineDropdownAnchor && apiMode && activePipeline && isPipelineOwnedByUser(activePipeline) && typeof document !== 'undefined' && createPortal(
        <div data-pipeline-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => { setPipelineDropdownOpen(false); setConfirmDeletePipeline(false) }} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-xl min-w-[180px] max-w-[min(92vw,220px)] py-1 overflow-hidden shadow-xl border border-white/15"
            style={{ top: pipelineDropdownAnchor.top, left: pipelineDropdownAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setPipelineDropdownOpen(false); toggleEditMode() }}
              className="w-full px-3 py-2.5 text-left text-sm text-white/95 flex items-center gap-2 hover:bg-white/10 transition-colors"
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
              className="w-full px-3 py-2.5 text-left text-sm text-white/95 flex items-center gap-2 hover:bg-white/10 transition-colors"
            >
              <Share2 className="h-4 w-4 flex-shrink-0" />
              Share pipeline
            </button>
            <div className="my-1 border-t border-white/10" />
            {!confirmDeletePipeline ? (
              <button
                type="button"
                onClick={() => setConfirmDeletePipeline(true)}
                className="w-full px-3 py-2.5 text-left text-sm text-red-400 flex items-center gap-2 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                Delete pipeline
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPipelineDropdownOpen(false)
                  setConfirmDeletePipeline(false)
                  onDeletePipeline?.(activePipeline.id)
                }}
                className="w-full px-3 py-2.5 text-left text-sm text-red-400 font-semibold flex items-center gap-2 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                Confirm delete
              </button>
            )}
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
            {!taskMenu.task.completed && (taskMenu.task.scheduledAt || taskMenu.task.dueAt) && onOpenScheduleAtDate && (
              <button
                type="button"
                onClick={() => {
                  setTaskMenu(null)
                  onOpenScheduleAtDate(taskMenu.task.scheduledAt || taskMenu.task.dueAt)
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
                const deal = taskMenu.task.dealId
                  ? displayDeals.find((d) => d.id === taskMenu.task.dealId)
                  : displayDeals.find((d) => String(d.parcelId) === String(taskMenu.task.parcelId))
                setTaskMenu(null)
                onCloseDeal?.()
                setEditTask({ task: taskMenu.task, deal: deal || null })
                setEditTaskTitle(taskMenu.task.title || '')
                setEditTaskScheduledAt(
                  taskMenu.task.__source === 'team'
                    ? (taskMenu.task.dueAt ?? taskMenu.task.scheduledAt ?? null)
                    : (taskMenu.task.scheduledAt ?? null)
                )
                setEditTaskScheduledEndAt(taskMenu.task.__source === 'team' ? null : (taskMenu.task.scheduledEndAt ?? null))
                setEditTaskAssignUids(
                  taskMenu.task.__source === 'team' && Array.isArray(taskMenu.task.assignedUids)
                    ? [...taskMenu.task.assignedUids]
                    : []
                )
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
                onCloseDeal?.()
                showConfirm({
                  title: 'Delete task',
                  message: `Delete "${(taskMenu.task.title || '').trim() || '(untitled)'}"?`,
                  confirmLabel: 'Delete',
                  variant: 'danger',
                  onConfirm: async () => {
                    const task = taskMenu.task
                    if (task.__source === 'team' && task.pipelineId && task.leadId) {
                      try {
                        await removeTeamTask(getToken, task.pipelineId, task.leadId, task.id)
                        await onPipelinesChange?.()
                      } catch (err) {
                        showToast(err.message || 'Could not delete task', 'error')
                      }
                      return
                    }
                    if (task.__source === 'pipeline' && task.pipelineId) {
                      try {
                        await removePipelineTask(getToken, task.pipelineId, task.id)
                        await onPipelinesChange?.()
                      } catch (err) {
                        showToast(err.message || 'Could not delete task', 'error')
                      }
                      return
                    }
                    deleteLeadTask(task.parcelId, task.id)
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
