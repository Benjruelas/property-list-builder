import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NewTaskDialog } from './NewTaskDialog'
import { MoveDealDialog } from './MoveDealDialog'
import { showToast } from './ui/toast'
import { pipelinesContainingParcel } from '@/utils/pipelineTasks'
import { getAllTeamMembers } from '@/utils/teamTaskUtils'
import { flattenDealsFromPipelines } from '@/utils/deals'
import { resolveTaskContext } from '@/utils/taskCreateFlow'
import { createServerTask } from '@/utils/serverTaskOps'

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
  const [pipePickerState, setPipePickerState] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const apiMode = pipelines.length > 0

  const resetSaving = useCallback(() => {
    savingRef.current = false
    setSaving(false)
  }, [])

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

  useEffect(() => {
    if (!open) resetSaving()
  }, [open, resetSaving])

  const finish = useCallback(() => {
    close()
    onCreated?.()
  }, [close, onCreated])

  const finalizeTaskCreate = useCallback(async (payload) => {
    if (savingRef.current) return
    if (!getToken) {
      showToast('Sign in to create tasks', 'error')
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await createServerTask(getToken, { ...payload, leads, pipelines })
      showToast('Task added', 'success')
      finish()
    } catch (error) {
      showToast(error.message || 'Could not add task', 'error')
      resetSaving()
    }
  }, [finish, getToken, leads, pipelines, resetSaving])

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

    if (assignedUids.length > 0 && !getToken) {
      showToast('Sign in to assign tasks to teammates', 'error')
      return
    }
    if (!getToken) {
      showToast('Sign in to create tasks', 'error')
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
        saving={saving}
        nestedOverlay
        topLayer
      />

      <MoveDealDialog
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
