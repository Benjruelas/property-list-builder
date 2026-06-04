import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import {
  getAllTasks,
  getPersonalTasks,
  deleteLeadTask,
  addTask,
  updateLeadTaskTitle,
  updateLeadTaskSchedule,
} from '@/utils/leadTasks'
import {
  addPipelineTask,
  removePipelineTask,
  updatePipelineTask,
} from '@/utils/pipelineTasks'
import { addTeamTask, removeTeamTask, updateTeamTask } from '@/utils/teamTasks'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { getAllTeamMembers, getMembersForTeamSharedPipeline, shouldStoreAsTeamTask } from '@/utils/teamTaskUtils'
import { collectTasksForDeal } from '@/utils/dealTaskMatching'
import { TaskRow } from './TasksPanel'
import { NewTaskDialog } from './NewTaskDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'

const taskGetters = { getPersonalTasks, getAllTasks }

/**
 * Deal-scoped tasks — same TaskRow and task dialog UX as LeadTasksSection.
 */
export function DealTasksSection({
  deal,
  lead = null,
  pipeline = null,
  leads = [],
  pipelines = [],
  teams = [],
  getToken,
  onPipelinesChange,
  onOpenScheduleAtDate,
  refreshKey = 0,
  readOnly = false,
}) {
  const { scheduleSync } = useUserDataSync()
  const [tasks, setTasks] = useState([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  const showTaskDialog = showAddTask || !!editingTask
  const isEditMode = !!editingTask
  const canMutate = !readOnly

  const displayLeads = useMemo(() => leads, [leads])
  const leadLabel = lead ? displayLeadName(lead) : (deal?.leadName || '')
  const leadAddress = lead ? formatLeadAddress(lead) : (deal?.leadAddress || '')
  const dealLabel = (deal?.title || deal?.leadAddress || 'Deal').trim()

  const taskLead = useMemo(() => {
    if (lead) return lead
    if (deal?.leadId) return displayLeads.find((l) => l.id === deal.leadId) || null
    if (deal?.parcelId) {
      return displayLeads.find((l) => String(l.parcelId) === String(deal.parcelId)) || null
    }
    return null
  }, [lead, deal, displayLeads])

  const dialogLeads = useMemo(() => {
    if (!taskLead?.id) return displayLeads
    if (displayLeads.some((l) => l.id === taskLead.id)) return displayLeads
    return [taskLead, ...displayLeads]
  }, [taskLead, displayLeads])

  const refreshTasks = useCallback(() => {
    if (!deal) {
      setTasks([])
      return
    }
    setTasksWithPendingMerge(setTasks, collectTasksForDeal(deal, pipelines, taskGetters))
  }, [deal, pipelines])

  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, refreshKey])

  useEffect(() => {
    setShowAddTask(false)
    setEditingTask(null)
  }, [deal?.id])

  const closeTaskDialog = () => {
    setShowAddTask(false)
    setEditingTask(null)
  }

  const editTaskPipeline = useMemo(() => {
    if (!editingTask?.pipelineId) return pipeline
    return pipelines.find((p) => p.id === editingTask.pipelineId) || pipeline
  }, [editingTask, pipeline, pipelines])

  const newTaskMemberList = useMemo(() => getAllTeamMembers(teams), [teams])
  const editTaskMemberList = useMemo(
    () => (editTaskPipeline ? getMembersForTeamSharedPipeline(editTaskPipeline, teams) : []),
    [editTaskPipeline, teams]
  )
  const editIsTeamContext = isEditMode && editingTask?.__source === 'team' && editTaskMemberList.length > 0
  const showTeamAssign = newTaskMemberList.length > 0 || editIsTeamContext
  const teamMemberList = editIsTeamContext ? editTaskMemberList : newTaskMemberList
  const teamContextActive =
    editIsTeamContext || (!!pipeline?.teamShares?.length && pipeline.teamShares.length > 0)

  const finalizeTaskCreate = useCallback(
    async ({ title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
      const pipelineId = pipeline?.id
      if (assignedUids.length > 0 && !deal?.leadId) {
        showToast('This deal needs a linked lead to assign teammates', 'error')
        return
      }
      if (pipelineId) {
        if (shouldStoreAsTeamTask(pipeline, { assignedUids, leadId: deal?.leadId })) {
          try {
            await addTeamTask(getToken, pipelineId, deal.leadId, {
              title,
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
        } else {
          try {
            await addPipelineTask(getToken, pipelineId, {
              title,
              parcelId: deal?.parcelId || null,
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
        }
      } else {
        if (assignedUids.length > 0) {
          showToast('Pick a pipe for this task to assign teammates', 'error')
          return
        }
        addTask({
          pipelineId: null,
          parcelId: deal?.parcelId || deal?.leadId || null,
          dealId: deal?.id || null,
          title,
          scheduledAt,
          scheduledEndAt,
        })
        scheduleSync()
        showToast('Task added', 'success')
      }
      setShowAddTask(false)
      refreshTasks()
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, pipeline, deal]
  )

  const handleDialogSubmit = ({ title, scheduledAt, scheduledEndAt, assignedUids }) => {
    if (isEditMode) {
      handleSaveEdit({ title, scheduledAt, scheduledEndAt, assignedUids })
      return
    }
    finalizeTaskCreate({ title, scheduledAt, scheduledEndAt, assignedUids })
  }

  const handleSaveEdit = async ({ title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
    const trimmed = title.trim()
    if (!trimmed || !editingTask) return
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!editIsTeamContext && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }

    const task = editingTask
    try {
      if (task.__source === 'team' && task.pipelineId && task.leadId) {
        await updateTeamTask(getToken, task.pipelineId, task.leadId, {
          id: task.id,
          title: trimmed,
          dueAt: scheduledAt,
          assignedUids,
        })
        await onPipelinesChange?.()
      } else if (task.__source === 'pipeline' && task.pipelineId) {
        await updatePipelineTask(getToken, task.pipelineId, {
          id: task.id,
          title: trimmed,
          scheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
      } else {
        updateLeadTaskTitle(task.parcelId, task.id, trimmed)
        updateLeadTaskSchedule(task.parcelId, task.id, scheduledAt, endAt)
        scheduleSync()
      }
      showToast('Task updated', 'success')
      closeTaskDialog()
      refreshTasks()
    } catch (err) {
      showToast(err.message || 'Could not update task', 'error')
    }
  }

  const handleToggle = useCallback(
    createOptimisticTaskToggleHandler({
      setTaskList: setTasks,
      getToken,
      onPipelinesChange,
      scheduleSync,
      onAfterLocalToggle: refreshTasks,
      onError: (err) => showToast(err.message || 'Could not update task', 'error'),
    }),
    [getToken, onPipelinesChange, scheduleSync, refreshTasks]
  )

  const handleDeleteTask = async (task) => {
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await removeTeamTask(getToken, task.pipelineId, task.leadId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      refreshTasks()
      return
    }
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await removePipelineTask(getToken, task.pipelineId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      refreshTasks()
      return
    }
    deleteLeadTask(task.parcelId, task.id)
    scheduleSync()
    refreshTasks()
    showToast('Task deleted', 'success')
  }

  const handleViewOnSchedule = (task) => {
    const at = task.scheduledAt || task.dueAt
    if (!at || !onOpenScheduleAtDate) return
    closeTaskDialog()
    onOpenScheduleAtDate(at)
  }

  const openAddTask = () => {
    setEditingTask(null)
    setShowAddTask(true)
  }

  const openEditTask = (task) => {
    setShowAddTask(false)
    setEditingTask(task)
  }

  if (!deal) return null

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase opacity-50">Tasks</h3>
          {canMutate && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={openAddTask}
              title="New task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="text-xs opacity-40 py-2">No tasks yet.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={`${task.id}-${task.__source || 'p'}`}>
                <TaskRow
                  task={task}
                  displayLeads={displayLeads}
                  teams={teams}
                  hideLeadLine
                  onToggle={canMutate ? handleToggle : () => {}}
                  onActivate={null}
                  onEdit={canMutate ? () => openEditTask(task) : null}
                  onDelete={canMutate ? () => handleDeleteTask(task) : null}
                  onViewOnSchedule={
                    (task.scheduledAt || task.dueAt) && onOpenScheduleAtDate
                      ? () => handleViewOnSchedule(task)
                      : null
                  }
                  onOpenLead={null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canMutate && (
        <NewTaskDialog
          open={showTaskDialog}
          onOpenChange={(open) => {
            if (!open) closeTaskDialog()
          }}
          isEditMode={isEditMode}
          showContextCard={isEditMode}
          contextPrimary={dealLabel}
          contextSecondary={leadLabel && leadLabel !== dealLabel ? leadLabel : ''}
          contextTertiary={leadAddress}
          initialTitle={editingTask?.title || ''}
          initialLeadId={isEditMode ? null : taskLead?.id || deal?.leadId || null}
          initialDealId={isEditMode ? null : deal?.id || null}
          initialScheduledAt={
            editingTask
              ? editingTask.__source === 'team'
                ? (editingTask.dueAt ?? editingTask.scheduledAt ?? null)
                : (editingTask.scheduledAt ?? null)
              : null
          }
          initialScheduledEndAt={
            editingTask && editingTask.__source !== 'team' ? (editingTask.scheduledEndAt ?? null) : null
          }
          initialTeamAssignUids={
            editingTask?.__source === 'team' && Array.isArray(editingTask.assignedUids)
              ? [...editingTask.assignedUids]
              : []
          }
          leads={dialogLeads}
          deals={deal ? [deal] : []}
          showDealPicker={!isEditMode}
          lockLead={!isEditMode}
          disableDealClear={!isEditMode}
          showTeamAssign={showTeamAssign}
          teamMembers={teamMemberList}
          teamContextActive={teamContextActive}
          leadName={leadLabel || dealLabel}
          leadAddress={leadAddress}
          onSubmit={handleDialogSubmit}
          nestedOverlay
          topLayer
        />
      )}
    </>
  )
}

export default DealTasksSection
