import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, Pencil, X, ArrowRight, Settings, ListTodo, CheckSquare, Square, ChevronDown, ChevronUp, Calendar, Eye, EyeOff, MoreVertical, Share2, Check, Users } from 'lucide-react'
import { Button } from './ui/button'
import { PanelBackButton, PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelOptionsButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss, mapListDialogOpen, listPanelObscuredByDetail } from './ui/panelDialogUtils'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { loadColumns, saveColumns, loadDeals, saveDeals, loadTitle, saveTitle } from '@/utils/dealPipeline'
import { getAllTasks, getPersonalTasks, addTask, toggleLeadTask, updateLeadTaskSchedule, updateLeadTaskTitle, deleteLeadTask, deleteAllLeadTasks, formatTaskCompletedDate, formatTaskScheduledDate, taskBelongsToPipeline } from '@/utils/leadTasks'
import { addPipelineTask, updatePipelineTask, togglePipelineTask, removePipelineTask, flattenPipelineTasks } from '@/utils/pipelineTasks'
import { addTeamTask, updateTeamTask, removeTeamTask, toggleTeamTask } from '@/utils/teamTasks'
import { getAllTeamMembers, flattenTeamTasks, formatAssigneeList, shouldStoreAsTeamTask } from '@/utils/teamTaskUtils'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { NewTaskDialog } from './NewTaskDialog'
import { createServerAssignedTask, resolveTaskContext, resolveTaskFormIdsFromTask } from '@/utils/taskCreateFlow'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DealDetails } from './DealDetails'
import { LeadDetails } from './LeadDetails'
import { canCollaborateOnPipeline, pipelinesUserCanWorkIn } from '@/utils/pipelines'
import { CreatePipelineDialog } from './CreatePipelineDialog'
import { displayLeadName, updateLead, toLeadPatchBody, isLeadPhotosOnlyPatch } from '@/utils/leads'
import { LeadSharingIcon, TeamSharedIcon } from './ResourceSharePicker'
import { ShareResourceDialog } from './ShareResourceDialog'
import { PipelineDealCard } from './DealRow'
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

import { leadToParcelData } from '@/utils/leads'
export function DealPipeline({
  isOpen,
  panelDockSlot,
  instantDismiss = false,
  onClose,
  onBack,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onTextClick,
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
  promotedDealId = null,
  promotedDealPipelineId = null,
  promotedDealPanelDockSlot,
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
  onOpenQuoteFromDeal,
  quotesRefreshKey = 0,
  canSeeDealAmounts = true,
  canAccessPhotos = true,
  onEditLead,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
  leadStatuses = [],
  editLeadId = null,
  onCreateLead,
}) {
  const { scheduleSync } = useUserDataSync()
  const apiMode = pipelines.length > 0
  const switcherPipelines = useMemo(
    () => pipelinesUserCanWorkIn(currentUser, pipelines, teams),
    [currentUser, pipelines, teams]
  )
  const pipelineById = pipelines.find((p) => p.id === activePipelineId) ?? null
  const activePipeline =
    pipelineById
    || switcherPipelines[0]
    || pipelines[0]
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
  const activeDealId = promotedDealId ?? focusDealId
  const selectedDeal = useMemo(() => {
    if (!activeDealId) return null
    return displayDeals.find((d) => d.id === activeDealId || String(d.parcelId) === String(activeDealId)) ?? null
  }, [activeDealId, displayDeals])
  const [allTasks, setAllTasks] = useState([])
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false)
  const [addTaskPrefill, setAddTaskPrefill] = useState(null)
  const [editTask, setEditTask] = useState(null)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [scheduledSectionCollapsed, setScheduledSectionCollapsed] = useState(false)
  const [unscheduledSectionCollapsed, setUnscheduledSectionCollapsed] = useState(false)
  const [taskMenu, setTaskMenu] = useState(null) // { task, anchor: { top, left } }
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false)
  const [pipelineDropdownAnchor, setPipelineDropdownAnchor] = useState(null)
  const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(false)
  const [pipelineSwitcherOpen, setPipelineSwitcherOpen] = useState(false)
  const [pipelineSwitcherAnchor, setPipelineSwitcherAnchor] = useState(null)
  const [createPipelineDialogOpen, setCreatePipelineDialogOpen] = useState(false)
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
    if (!pipelineById) return false
    return canCollaborateOnPipeline(currentUser, pipelineById, teams)
  }, [apiMode, pipelineById, currentUser, teams])

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
  // Only seed local state when the share dialog opens — not on every pipelines refresh.
  }, [sharePipelineId])

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

  const closeSharePipeline = useCallback(() => {
    setSharePipelineId(null)
    setShareEmail('')
    setShareEmailValid(null)
    setShareEmailError('')
  }, [])

  const handlePipelineShareEmailSave = useCallback(() => {
    if (!sharePipelineId || !onSharePipeline) return
    const email = shareEmail.trim().toLowerCase()
    if (!email) { showToast('Please enter an email', 'error'); return }
    if (shareEmailValid === false) { showToast('No user found with this email', 'error'); return }
    if (shareEmailValid !== true && onValidateShareEmail) { showToast('Please wait for email validation', 'error'); return }
    const pipe = pipelines.find((p) => p.id === sharePipelineId)
    const current = pipe?.sharedWith || []
    if (current.some((e) => (e || '').toLowerCase() === email)) { showToast('This email is already in the share list', 'error'); return }
    onSharePipeline(sharePipelineId, [...current, email])
    setShareEmail('')
    setShareEmailValid(null)
    setShareEmailError('')
    showToast('Email added to share list', 'success')
  }, [sharePipelineId, onSharePipeline, shareEmail, shareEmailValid, onValidateShareEmail, pipelines])

  const refreshAllTasks = useCallback(() => {
    // Personal tasks = local leadTasks store with no pipelineId (tasks with a
    // pipelineId now live on the pipeline doc; legacy rows are migrated away
    // on first load in App.jsx). Pipeline tasks are flattened from
    // pipelines[].tasks which are fetched by /api/pipelines (access-filtered).
    const personal = apiMode ? getPersonalTasks() : getAllTasks()
    const pipeScoped = apiMode ? flattenPipelineTasks(pipelines) : []
    const teamScoped = apiMode ? flattenTeamTasks(pipelines) : []
    setTasksWithPendingMerge(setAllTasks, [...personal, ...pipeScoped, ...teamScoped])
  }, [apiMode, pipelines])

  useEffect(() => {
    if (!activeDealId) refreshAllTasks()
  }, [activeDealId, refreshAllTasks])

  const handleToggleTask = useCallback(
    createOptimisticTaskToggleHandler({
      setTaskList: setAllTasks,
      getToken,
      onPipelinesChange,
      scheduleSync,
      onAfterLocalToggle: refreshAllTasks,
      onError: (err) => showToast(err.message || 'Failed to update task', 'error'),
    }),
    [getToken, onPipelinesChange, scheduleSync, refreshAllTasks]
  )

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
    onLeadsChange?.((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
    const payload = toLeadPatchBody(updated)
    if (isLeadPhotosOnlyPatch(payload)) return
    try {
      const saved = await updateLead(getToken, updated.id, payload)
      onLeadsChange?.((prev) => prev.map((l) => (l.id === saved.id ? saved : l)))
    } catch (e) {
      showToast(e.message || 'Could not update lead', 'error')
    }
  }, [getToken, onLeadsChange])

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
    const confirmed = await showConfirm({
      title: 'Delete deal?',
      message: 'Tasks and files on this deal will be lost.\nThis cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
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
      const ctx = resolveTaskContext({
        leadId: addTaskLeadId,
        dealId: addTaskDealId,
        deal,
        leads: leads || [],
        pipelines,
      })
      const parcelId = ctx.parcelId || deal?.parcelId || selectedLead?.parcelId || null
      if (assignedUids.length > 0 && getToken) {
        try {
          await createServerAssignedTask(getToken, {
            title: trimmed,
            scheduledAt,
            scheduledEndAt,
            assignedUids,
            leadId: ctx.leadId,
            dealId: ctx.dealId,
            deal,
            leads: leads || [],
            pipelines,
            pipelineId: activePipelineId || ctx.pipelineId,
          })
          showToast('Task added', 'success')
          setShowAddTaskDialog(false)
          setAddTaskPrefill(null)
          if (deal) onOpenDeal?.(deal.id)
          return
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      }
      const leadId = ctx.leadId || deal?.leadId || null
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
      pipelines,
      onOpenDeal,
    ]
  )

  const commitEditTask = useCallback(async ({ title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
    const trimmed = (title || '').toString().trim()
    if (!trimmed || !editTask?.task) return
    const task = editTask.task
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await updateTeamTask(getToken, task.pipelineId, task.leadId, {
          id: task.id,
          title: trimmed,
          dueAt: scheduledAt,
          assignedUids,
        })
        await onPipelinesChange?.()
        showToast('Task updated', 'success')
        setEditTask(null)
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
          scheduledAt,
          scheduledEndAt,
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
    updateLeadTaskSchedule(task.parcelId, task.id, scheduledAt, scheduledEndAt)
    refreshAllTasks()
    scheduleSync()
    showToast('Task updated', 'success')
    setEditTask(null)
  }, [editTask, getToken, onPipelinesChange, refreshAllTasks, scheduleSync])

  const newTaskTeamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const editTaskFormIds = useMemo(
    () => resolveTaskFormIdsFromTask(editTask?.task, leads || [], displayDeals),
    [editTask, leads, displayDeals]
  )

  const resetPipelineUi = () => {
    setIsEditMode(false)
    setEditingColumnId(null)
    setShowAddColumn(false)
    setTaskMenu(null)
    setPipelineDropdownOpen(false)
    setPipelineSwitcherOpen(false)
    setSharePipelineId(null)
  }

  const hasNestedDetail = !!(activeDealId || leadOverlayId)
  const listDialogOpen = mapListDialogOpen(isOpen)
  const listObscuredByDetail = listPanelObscuredByDetail(isOpen, hasNestedDetail)
  const pipelinePanelRef = useRef(null)
  useObscuredPanelRoot(pipelinePanelRef, listObscuredByDetail)
  const columnsScrollRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined
    const el = columnsScrollRef.current
    if (!el) return undefined

    const onWheel = (e) => {
      if (window.matchMedia('(max-width: 767px)').matches) return
      if (el.scrollWidth <= el.clientWidth + 1) return

      const columnBody = e.target.closest('.deal-pipeline-column-body')
      if (columnBody instanceof HTMLElement && columnBody.scrollHeight > columnBody.clientHeight + 1) {
        const { scrollTop, clientHeight, scrollHeight } = columnBody
        const atTop = scrollTop <= 0
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1
        if (e.deltaY > 0 && !atBottom) return
        if (e.deltaY < 0 && !atTop) return
      }

      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return

      el.scrollLeft += e.deltaY
      e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isOpen, columns.length, activePipelineId])

  const handlePipelineBack = () => {
    if (leadOverlayId) {
      onCloseLeadOverlay?.()
      return
    }
    if (selectedDeal || activeDealId) {
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
    <Dialog open={listDialogOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
      <DialogContent
        ref={pipelinePanelRef}
        className={cn(
          'map-panel deal-pipeline-panel fullscreen-panel flex flex-col',
          listObscuredByDetail && 'crm-list-under-detail',
        )}
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
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
              {apiMode && switcherPipelines.length > 0 && (
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
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden deal-pipeline-content">
          <div
            ref={columnsScrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide px-6 pt-0 pb-3 min-w-0 min-h-0 deal-pipeline-columns"
          >
          <div className="deal-pipeline-columns-row flex flex-col md:flex-row md:flex-nowrap gap-2 h-full min-w-0 md:min-w-full md:min-h-full">
            {columns.map((col) => (
              <div
                key={col.id}
                className="deal-pipeline-column flex-none w-full md:min-w-[9.25rem] md:flex-1 md:basis-0 rounded-lg border border-white/15 bg-white/[0.12] flex flex-col min-h-[100px] md:min-h-[200px]"
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
                  className={`deal-pipeline-column-body flex-1 overflow-y-auto scrollbar-hide p-1.5 space-y-2 min-h-[60px] transition-colors rounded-b-lg ${dragOverColId === col.id ? 'bg-blue-500/10' : ''}`}
                  onDragOver={canCollaboratePipeline ? (e) => handleDragOver(e, col.id) : undefined}
                  onDragLeave={canCollaboratePipeline ? handleDragLeave : undefined}
                  onDrop={canCollaboratePipeline ? (e) => handleDrop(e, col.id) : undefined}
                >
                  {getDealsForColumn(col.id).map((deal) => (
                    <PipelineDealCard
                      key={deal.id}
                      deal={deal}
                      leads={leads}
                      tagRegistry={tagRegistry}
                      canSeeDealAmounts={canSeeDealAmounts}
                      isDragging={draggedDealId === deal.id}
                      isEditMode={isEditMode}
                      canCollaborate={canCollaboratePipeline}
                      canMoveNext={columns.findIndex((c) => c.id === deal.status) < columns.length - 1}
                      draggable={canCollaboratePipeline}
                      onDragStart={canCollaboratePipeline ? (e) => handleDragStart(e, deal.id) : undefined}
                      onDragEnd={canCollaboratePipeline ? handleDragEnd : undefined}
                      onClick={() => handleDealClick(deal)}
                      onMoveNext={() => handleMoveToNext(deal.id)}
                      onDelete={() => handleDeleteDeal(deal.id)}
                    />
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
                        onClick={(e) => handleToggleTask(e, task)}
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
                            <TeamSharedIcon title="Team task" size="xs" />
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
          obscuredByChild={!!leadOverlayId}
          panelDockSlot={promotedDealPanelDockSlot}
          primaryDetail={!!promotedDealId}
          topLayer
          hideOverlay
          suppressBackdrop
          deal={selectedDeal}
          pipeline={
            (promotedDealPipelineId && pipelines.find((p) => p.id === promotedDealPipelineId))
            || activePipeline
          }
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
          onOpenQuote={onOpenQuoteFromDeal}
          quotesRefreshKey={quotesRefreshKey}
          canSeeDealAmounts={canSeeDealAmounts}
          tagRegistry={tagRegistry}
          onRefreshTags={onRefreshTags}
          currentUser={currentUser}
          canAccessPhotos={canAccessPhotos}
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
          onTextClick={onTextClick}
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
          externalNestedOverlay={!!editLeadId && editLeadId === leadOverlay?.id}
          onEditLead={onEditLead}
          tagRegistry={tagRegistry}
          onRefreshTags={onRefreshTags}
          leadStatuses={leadStatuses}
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
        onCreateLead={onCreateLead}
        nestedOverlay
      />

      <NewTaskDialog
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
        isEditMode
        leads={leads || []}
        deals={displayDeals}
        showDealPicker
        initialTitle={editTask?.task?.title || ''}
        initialLeadId={editTaskFormIds.leadId}
        initialDealId={editTaskFormIds.dealId}
        onCreateLead={onCreateLead}
        initialScheduledAt={
          editTask?.task
            ? editTask.task.__source === 'team'
              ? (editTask.task.dueAt ?? editTask.task.scheduledAt ?? null)
              : (editTask.task.scheduledAt ?? null)
            : null
        }
        initialScheduledEndAt={
          editTask?.task && editTask.task.__source !== 'team' ? (editTask.task.scheduledEndAt ?? null) : null
        }
        initialDateTimeExpanded={!!(editTask?.task?.scheduledAt || editTask?.task?.dueAt)}
        initialTeamAssignUids={
          editTask?.task?.__source === 'team' && Array.isArray(editTask.task.assignedUids)
            ? [...editTask.task.assignedUids]
            : []
        }
        lockLead={!!(editTaskFormIds.dealId || editTaskFormIds.leadId)}
        lockDeal={!!editTaskFormIds.dealId}
        disableDealClear={!!editTaskFormIds.dealId}
        showTeamAssign={editTask?.task?.__source === 'team' && newTaskTeamMembers.length > 0}
        teamMembers={newTaskTeamMembers}
        teamContextActive={editTask?.task?.__source === 'team'}
        onSubmit={commitEditTask}
        nestedOverlay
      />

      {sharePipelineId && onSharePipeline && (() => {
        const pipe = pipelines.find((p) => p.id === sharePipelineId)
        const shareState = localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
        const activeTeam = teams?.[0] || null
        const allowExternalSharing = teamMembership?.allowExternalSharing === true
        return (
          <ShareResourceDialog
            open={!!sharePipelineId}
            onOpenChange={(open) => { if (!open) closeSharePipeline() }}
            title="Share pipeline"
            pipelineDialog
            team={activeTeam}
            showTeamPicker={Boolean(onSharePipelineWithTeams && activeTeam)}
            shareState={shareState}
            onShareStateChange={handlePipelineShareChange}
            allowExternalSharing={allowExternalSharing}
            sharedWithEmails={pipe?.sharedWith || []}
            onRemoveSharedEmail={(email) => {
              const updated = (pipe?.sharedWith || []).filter((e) => (e || '').toLowerCase() !== (email || '').toLowerCase())
              onSharePipeline(sharePipelineId, updated)
            }}
            shareEmail={shareEmail}
            onShareEmailChange={setShareEmail}
            shareEmailValid={shareEmailValid}
            shareEmailError={shareEmailError}
            isValidatingShare={isValidatingShare}
            onShareEmailSave={handlePipelineShareEmailSave}
          />
        )
      })()}

      <CreatePipelineDialog
        open={createPipelineDialogOpen}
        onOpenChange={setCreatePipelineDialogOpen}
        getToken={getToken}
        onPipelinesChange={onPipelinesChange}
        onActivePipelineChange={onActivePipelineChange}
        teams={teams}
        teamMembership={teamMembership}
        nestedOverlay
        topLayer
      />

      {pipelineSwitcherOpen && pipelineSwitcherAnchor && apiMode && typeof document !== 'undefined' && createPortal(
        <div data-pipeline-switcher className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10010 }}>
          <div className="fixed inset-0 z-[10011]" onClick={() => setPipelineSwitcherOpen(false)} aria-hidden />
          <div
            className="map-panel list-panel fixed z-[10012] rounded-xl min-w-[220px] max-w-[min(90vw,320px)] max-h-[min(50vh,280px)] overflow-y-auto scrollbar-hide py-1 shadow-xl border border-white/15"
            style={{ top: pipelineSwitcherAnchor.top, left: pipelineSwitcherAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {switcherPipelines.map((p) => (
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
                  <LeadSharingIcon resource={p} collaboratorHint={p.ownerId !== currentUser?.uid} />
                </div>
              </button>
            ))}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPipelineSwitcherOpen(false)
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
