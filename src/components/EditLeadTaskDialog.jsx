import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { getStreetAddress, getFullAddress, loadLeads } from '@/utils/dealPipeline'
import { updateLeadTaskTitle, updateLeadTaskSchedule } from '@/utils/leadTasks'
import { updatePipelineTask } from '@/utils/pipelineTasks'
import { updateTeamTask } from '@/utils/teamTasks'
import { getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import { TeamMemberAssignSectionLight } from './TeamMemberAssignSection'
import { SchedulePicker } from './SchedulePicker'
import { showToast } from './ui/toast'

/**
 * Edit task (title, schedule, team assignees) from Lead Details or similar — same
 * rules as DealPipeline: team tasks, pipeline tasks, or personal lead tasks.
 */
export function EditLeadTaskDialog({
  open,
  onOpenChange,
  context,
  pipelines = [],
  teams = [],
  displayLeads = [],
  getToken,
  onPipelinesChange,
  scheduleSync,
  onSaved,
  getLeadLabel = (parcelId) => {
    if (!parcelId) return 'Pipeline task'
    const lead = displayLeads.find((l) => l.parcelId === parcelId)
    if (lead) return getStreetAddress(lead) || lead.address || lead.owner || parcelId
    return parcelId
  },
}) {
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState(null)
  const [scheduledEndAt, setScheduledEndAt] = useState(null)
  const [assignUids, setAssignUids] = useState([])

  const task = context?.task
  const lead = context?.lead

  useEffect(() => {
    if (!task) return
    setTitle(task.title || '')
    setScheduledAt(
      task.__source === 'team' ? (task.dueAt ?? task.scheduledAt ?? null) : (task.scheduledAt ?? null)
    )
    setScheduledEndAt(task.__source === 'team' ? null : (task.scheduledEndAt ?? null))
    setAssignUids(
      task.__source === 'team' && Array.isArray(task.assignedUids) ? [...task.assignedUids] : []
    )
  }, [task])

  const pipeline = useMemo(() => {
    const pid = task?.pipelineId
    return pid ? pipelines.find((p) => p.id === pid) : null
  }, [task, pipelines])

  const teamMembers = useMemo(
    () => (pipeline ? getMembersForTeamSharedPipeline(pipeline, teams) : []),
    [pipeline, teams]
  )

  const save = useCallback(async () => {
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
          assignedUids: assignUids,
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
  }, [task, title, scheduledAt, scheduledEndAt, assignUids, getToken, onPipelinesChange, scheduleSync, onOpenChange, onSaved])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel new-task-panel !flex !max-w-md w-[min(92vw,24rem)] max-h-[min(92vh,900px)] min-h-[min(68vh,560px)] flex-col gap-0 p-0 !rounded-2xl"
        showCloseButton={false}
        nestedOverlay
        topLayer
      >
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-white/20">
          <DialogTitle className="text-xl font-semibold">Edit task</DialogTitle>
          <DialogDescription className="sr-only">Edit task details</DialogDescription>
        </DialogHeader>
        {task && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 scrollbar-hide create-list-form">
            {task.parcelId ? (
              <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95 space-y-1">
                {(() => {
                  const l =
                    lead ||
                    displayLeads.find((x) => String(x.parcelId) === String(task.parcelId)) ||
                    loadLeads().find((x) => String(x.parcelId) === String(task.parcelId))
                  const name = (l?.owner || l?.properties?.OWNER_NAME || '').toString().trim()
                  const address = l ? (getFullAddress(l) || l.address || getStreetAddress(l) || '').toString().trim() : ''
                  const fallback = getLeadLabel(task.parcelId) || task.parcelId || 'Unknown'
                  return (name || address) ? (
                    <>
                      {name && <div className="font-medium truncate" title={name}>{name}</div>}
                      {address && <div className={`text-white/85 truncate ${name ? 'text-xs' : ''}`} title={address}>{address}</div>}
                    </>
                  ) : (
                    <div className="truncate" title={fallback}>{fallback}</div>
                  )
                })()}
              </div>
            ) : (
              <div className="rounded border border-white/20 px-3 py-2 text-sm text-white/95">
                <span className="text-[10px] uppercase text-white/70">Scope</span>
                <div className="truncate">Pipeline task (no lead)</div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Task title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Call back on Monday"
                className="text-sm"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const t = title.trim()
                    if (t) await save()
                  }
                }}
              />
            </div>
            <SchedulePicker
              inline
              value={scheduledAt}
              onChange={setScheduledAt}
              endValue={task?.__source === 'team' ? null : scheduledEndAt}
              onEndChange={task?.__source === 'team' ? undefined : setScheduledEndAt}
              minDate={Date.now()}
            />
            {task?.__source === 'team' && (pipeline?.teamShares || []).length > 0 && (
              <TeamMemberAssignSectionLight
                members={teamMembers}
                selectedUids={assignUids}
                onToggle={(uid) => {
                  setAssignUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]))
                }}
              />
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={save} disabled={!title.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="create-list-btn flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
