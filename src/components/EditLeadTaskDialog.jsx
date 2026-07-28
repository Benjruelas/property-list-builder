import { useMemo, useCallback } from 'react'
import { NewTaskDialog } from './NewTaskDialog'
import { patchServerTask } from '@/utils/serverTaskOps'
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
      if (!getToken) {
        showToast('Sign in to update tasks', 'error')
        return
      }
      try {
        await patchServerTask(getToken, task.id, {
          title: trimmed,
          scheduledAt,
          scheduledEndAt,
          assignedUids: teamMembers.length > 0 ? assignedUids : undefined,
        })
        showToast('Task updated', 'success')
        onOpenChange(false)
        onSaved?.()
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
    },
    [task, getToken, teamMembers.length, onOpenChange, onSaved]
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
      initialAssignedUids={task?.assignedUids || []}
      showTeamAssign={teamMembers.length > 0}
      teamMembers={teamMembers}
      onSubmit={handleSubmit}
      nestedOverlay
      topLayer
    />
  )
}
