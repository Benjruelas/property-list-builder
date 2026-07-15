import { useCallback, useMemo, useState } from 'react'
import { NewTaskDialog } from './NewTaskDialog'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { addTask } from '@/utils/leadTasks'
import { addPipelineTask, pipelinesContainingParcel } from '@/utils/pipelineTasks'
import { addTeamTask } from '@/utils/teamTasks'
import {
  getAllTeamMembers,
  resolveTeamTaskLeadId,
  shouldStoreAsTeamTask,
} from '@/utils/teamTaskUtils'
import { flattenDealsFromPipelines } from '@/utils/deals'
import { createServerAssignedTask, resolveTaskContext } from '@/utils/taskCreateFlow'

export function CreateTaskPanel({
  open,
  onOpenChange,
  pipelines = [],
  leads = [],
  deals = [],
  getToken = null,
  currentUser = null,
  teams = [],
  onPipelinesChange,
  onCreated,
  onCreateLead,
}) {
  const { scheduleSync } = useUserDataSync()
  const [pipePickerState, setPipePickerState] = useState(null)
  const apiMode = pipelines.length > 0

  const allDeals = useMemo(() => {
    const fromPipelines = flattenDealsFromPipelines(pipelines)
    if (fromPipelines.length > 0) return fromPipelines
    return (deals || []).map((deal) => ({
      ...deal,
      __pipelineId: deal.__pipelineId ?? deal.pipelineId ?? null,
    }))
  }, [pipelines, deals])

  const teamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const close = useCallback(() => {
    setPipePickerState(null)
    onOpenChange?.(false)
  }, [onOpenChange])

  const finish = useCallback(() => {
    close()
    onCreated?.()
  }, [close, onCreated])

  const finalizeTaskCreate = useCallback(async ({
    pipelineId,
    parcelId,
    dealId,
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    leadId = null,
    deal = null,
    notes = null,
  }) => {
    if (assignedUids.length > 0 && getToken) {
      try {
        await createServerAssignedTask(getToken, {
          title,
          scheduledAt,
          scheduledEndAt,
          assignedUids,
          leadId,
          dealId,
          deal,
          leads,
          pipelines,
          pipelineId,
          notes,
        })
        showToast('Task added', 'success')
        finish()
      } catch (error) {
        showToast(error.message || 'Could not add task', 'error')
      }
      return
    }

    if (pipelineId) {
      const pipeline = pipelines.find((item) => item.id === pipelineId)
      const resolvedLeadId = resolveTeamTaskLeadId(pipeline, {
        parcelId,
        dealId,
        deals: pipeline?.deals || [],
        displayLeads: leads,
      })
      if (shouldStoreAsTeamTask(pipeline, { assignedUids, leadId: resolvedLeadId })) {
        try {
          await addTeamTask(getToken, pipelineId, resolvedLeadId, {
            title,
            dueAt: scheduledAt,
            assignedUids,
            dealId: dealId || null,
          })
          await onPipelinesChange?.()
          showToast('Task added', 'success')
          finish()
        } catch (error) {
          showToast(error.message || 'Could not add task', 'error')
        }
        return
      }
      if (assignedUids.length > 0 && !resolvedLeadId) {
        showToast('Could not resolve a lead for this pipe task', 'error')
        return
      }
      try {
        await addPipelineTask(getToken, pipelineId, {
          title,
          parcelId: parcelId || null,
          dealId: dealId || null,
          scheduledAt,
          scheduledEndAt,
          notes,
        })
        await onPipelinesChange?.()
        showToast('Task added', 'success')
        finish()
      } catch (error) {
        showToast(error.message || 'Could not add task', 'error')
      }
      return
    }

    addTask({
      pipelineId: null,
      parcelId: parcelId || null,
      dealId: dealId || null,
      leadId: leadId || null,
      title,
      scheduledAt,
      scheduledEndAt,
      notes,
    })
    scheduleSync()
    showToast('Task added', 'success')
    finish()
  }, [finish, getToken, leads, onPipelinesChange, pipelines, scheduleSync])

  const handleCreateTask = useCallback(({
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    leadId,
    dealId,
    notes = null,
  }) => {
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (assignedUids.length === 0 && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }

    const selectedDealId = dealId || null
    const deal = selectedDealId ? allDeals.find((item) => item.id === selectedDealId) : null
    const context = resolveTaskContext({
      leadId,
      dealId: selectedDealId,
      deal,
      leads,
      pipelines,
    })
    const payload = {
      title: trimmed,
      scheduledAt,
      scheduledEndAt: endAt,
      parcelId: context.parcelId,
      dealId: context.dealId,
      leadId: context.leadId,
      deal,
      assignedUids,
      notes,
    }

    if (assignedUids.length > 0) {
      if (!getToken) {
        showToast('Sign in to assign tasks to teammates', 'error')
        return
      }
      void finalizeTaskCreate({ ...payload, pipelineId: context.pipelineId })
      return
    }
    if (context.dealId && apiMode && context.pipelineId) {
      void finalizeTaskCreate({ ...payload, pipelineId: context.pipelineId })
      return
    }
    if (context.parcelId) {
      const leadForParcel = leads.find((item) => item.parcelId === context.parcelId)
      if (leadForParcel?.__pipelineId) {
        void finalizeTaskCreate({ ...payload, pipelineId: leadForParcel.__pipelineId })
        return
      }
      if (apiMode) {
        const owning = pipelinesContainingParcel(pipelines, context.parcelId)
        if (owning.length === 1) {
          void finalizeTaskCreate({ ...payload, pipelineId: owning[0].id })
          return
        }
        if (owning.length > 1) {
          setPipePickerState({
            open: true,
            eligiblePipelines: owning,
            allowNoPipe: false,
            payload,
          })
          return
        }
      }
    }
    void finalizeTaskCreate({ ...payload, pipelineId: null })
  }, [allDeals, apiMode, finalizeTaskCreate, getToken, leads, pipelines])

  return (
    <>
      <NewTaskDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close()
          else onOpenChange?.(true)
        }}
        leads={leads}
        deals={allDeals}
        showDealPicker={apiMode}
        showTeamAssign={teamMembers.length > 0}
        teamMembers={teamMembers}
        onSubmit={handleCreateTask}
        onCreateLead={onCreateLead}
        nestedOverlay
        topLayer
      />

      <ConvertToLeadPipelineDialog
        open={!!pipePickerState?.open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPipePickerState(null)
        }}
        pipelines={pipePickerState?.eligiblePipelines ?? []}
        currentUser={currentUser}
        topLayer
        title="Pick a pipe for this task"
        description="Everyone the pipe is shared with will see this task."
        allowNoPipe={!!pipePickerState?.allowNoPipe}
        noPipeLabel="No pipe"
        noPipeDescription="Only you will see this task."
        onSelect={(pipelineId) => {
          const payload = pipePickerState?.payload
          setPipePickerState(null)
          if (payload) void finalizeTaskCreate({ ...payload, pipelineId })
        }}
        onSelectNoPipe={() => {
          const payload = pipePickerState?.payload
          setPipePickerState(null)
          if (payload) void finalizeTaskCreate({ ...payload, pipelineId: null })
        }}
      />
    </>
  )
}
