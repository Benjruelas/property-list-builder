import { useMemo, useCallback } from 'react'
import { NewTaskDialog } from './NewTaskDialog'
import { updateLeadTaskTitle, updateLeadTaskSchedule } from '@/utils/leadTasks'
import { updatePipelineTask } from '@/utils/pipelineTasks'
import { updateTeamTask } from '@/utils/teamTasks'
import { getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import { resolveTaskFormIdsFromTask } from '@/utils/taskCreateFlow'
import { showToast } from './ui/toast'

/**
 * Edit task from Lead Details, Schedule, etc. — same panel as New task.
 */
export function EditLeadTaskDialog({
  open,
  onOpenChange,
  context,
  pipelines = [],
  teams = [],
  displayLeads = [],
  deals = [],
  getToken,
  onPipelinesChange,
  scheduleSync,
  onSaved,
}) {
  const task = context?.task

  const pipeline = useMemo(() => {
    const pid = task?.pipelineId
    return pid ? pipelines.find((p) => p.id === pid) : null
  }, [task, pipelines])

  const teamMembers = useMemo(
    () => (pipeline ? getMembersForTeamSharedPipeline(pipeline, teams) : []),
    [pipeline, teams]
  )

  const formIds = useMemo(
    () => resolveTaskFormIdsFromTask(task, displayLeads, deals),
    [task, displayLeads, deals]
  )

  const isTeamTask = task?.__source === 'team'

  const handleSubmit = useCallback(
    async ({ title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
      const trimmed = (title || '').toString().trim()
      if (!trimmed || !task) return
      if (task.__source === 'team' && task.pipelineId && task.leadId) {
        if (!getToken) {
          showToast('Sign in to update tasks', 'error')
          return
        }
        try {
          await updateTeamTask(getToken, task.pipelineId, task.leadId, {
            id: task.id,
            title: trimmed,
            dueAt: scheduledAt,
            assignedUids,
          })
          await onPipelinesChange?.()
          showToast('Task updated', 'success')
          onOpenChange(false)
          onSaved?.()
        } catch (err) {
          showToast(err.message || 'Could not update task', 'error')
        }
        return
      }
      if (task.__source === 'pipeline' && task.pipelineId) {
        if (!getToken) {
          showToast('Sign in to update tasks', 'error')
          return
        }
        try {
          await updatePipelineTask(getToken, task.pipelineId, {
            id: task.id,
            title: trimmed,
            scheduledAt,
            scheduledEndAt,
          })
          await onPipelinesChange?.()
          showToast('Task updated', 'success')
          onOpenChange(false)
          onSaved?.()
        } catch (err) {
          showToast(err.message || 'Could not update task', 'error')
        }
        return
      }
      updateLeadTaskTitle(task.parcelId, task.id, trimmed)
      updateLeadTaskSchedule(task.parcelId, task.id, scheduledAt, scheduledEndAt)
      scheduleSync?.()
      showToast('Task updated', 'success')
      onOpenChange(false)
      onSaved?.()
    },
    [task, getToken, onPipelinesChange, scheduleSync, onOpenChange, onSaved]
  )

  return (
    <NewTaskDialog
      open={open}
      onOpenChange={onOpenChange}
      isEditMode
      leads={displayLeads}
      deals={deals}
      showDealPicker={deals.length > 0}
      initialTitle={task?.title || ''}
      initialLeadId={formIds.leadId}
      initialDealId={formIds.dealId}
      initialScheduledAt={
        task
          ? isTeamTask
            ? (task.dueAt ?? task.scheduledAt ?? null)
            : (task.scheduledAt ?? null)
          : null
      }
      initialScheduledEndAt={task && !isTeamTask ? (task.scheduledEndAt ?? null) : null}
      initialDateTimeExpanded={!!(task?.scheduledAt || task?.dueAt)}
      initialTeamAssignUids={
        isTeamTask && Array.isArray(task?.assignedUids) ? [...task.assignedUids] : []
      }
      lockLead={!!formIds.leadId}
      lockDeal={!!formIds.dealId}
      disableDealClear={!!formIds.dealId}
      showTeamAssign={isTeamTask && teamMembers.length > 0}
      teamMembers={teamMembers}
      teamContextActive={isTeamTask}
      onSubmit={handleSubmit}
      nestedOverlay
      topLayer
    />
  )
}
