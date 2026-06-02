import { useMemo, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { createPendingDealTask, mapPrefillTaskRows, taskRowsForSubmit } from '@/utils/dealTasks'
import { getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import {
  FINANCES_SUMMARY_ROW,
  FINANCES_OPTIONS_BTN,
  FinancesOptionsSpacer,
} from './DealLineItemsSection'
import { NewTaskDialog } from './NewTaskDialog'
import { TaskRow } from './TasksPanel'

export { createPendingDealTask, mapPrefillTaskRows, taskRowsForSubmit }

function pendingTaskForDisplay(task, lead, isTeamPipeline) {
  const hasTeamMeta =
    isTeamPipeline && Array.isArray(task.assignedUids) && task.assignedUids.length > 0
  return {
    id: task.id,
    title: task.title,
    completed: !!task.completed,
    completedAt: task.completed ? (task.completedAt ?? Date.now()) : null,
    createdAt: task.createdAt ?? Date.now(),
    scheduledAt: task.scheduledAt ?? null,
    scheduledEndAt: task.scheduledEndAt ?? null,
    assignedUids: task.assignedUids ?? [],
    parcelId: lead?.parcelId || lead?.id || null,
    ...(hasTeamMeta ? { __source: 'team', dueAt: task.scheduledAt ?? null } : {}),
  }
}

export function CreateDealTasksEditor({
  tasks = [],
  onChange,
  dealTitle = '',
  lead = null,
  pipeline = null,
  teams = [],
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null
  const isEditMode = !!editingTask

  const leadLabel = lead ? displayLeadName(lead) : ''
  const leadAddress = lead ? formatLeadAddress(lead) : ''
  const contextPrimary = (dealTitle || leadLabel || 'New deal').trim()
  const teamMembers = useMemo(
    () => (pipeline ? getMembersForTeamSharedPipeline(pipeline, teams) : []),
    [pipeline, teams]
  )
  const showTeamAssign = teamMembers.length > 0
  const teamContextActive = showTeamAssign
  const isTeamPipeline = Array.isArray(pipeline?.teamShares) && pipeline.teamShares.length > 0

  const displayLeads = useMemo(() => (lead ? [lead] : []), [lead])

  const pendingDeal = useMemo(() => {
    if (isEditMode) return null
    return {
      id: '__pending_deal__',
      title: (dealTitle || leadLabel || 'New deal').trim(),
      leadId: lead?.id ?? null,
      leadName: leadLabel,
      leadAddress,
      parcelId: lead?.parcelId ?? null,
    }
  }, [isEditMode, dealTitle, leadLabel, leadAddress, lead])

  const countLabel = tasks.length === 1 ? '1 task' : `${tasks.length} tasks`
  const expanded = !collapsed

  const openAddTask = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setEditingTaskId(null)
    setShowTaskDialog(true)
  }

  const openEditTask = (task) => {
    setEditingTaskId(task.id)
    setShowTaskDialog(true)
  }

  const closeTaskDialog = () => {
    setShowTaskDialog(false)
    setEditingTaskId(null)
  }

  const handleSubmitTask = ({ title, scheduledAt, scheduledEndAt, assignedUids }) => {
    if (isEditMode && editingTask) {
      onChange?.(
        tasks.map((t) =>
          t.id === editingTask.id
            ? createPendingDealTask({ ...t, title, scheduledAt, scheduledEndAt, assignedUids })
            : t
        )
      )
    } else {
      onChange?.([
        ...tasks,
        createPendingDealTask({ title, scheduledAt, scheduledEndAt, assignedUids }),
      ])
    }
    closeTaskDialog()
  }

  const deleteTask = (id) => {
    onChange?.(tasks.filter((t) => t.id !== id))
  }

  const handleToggle = (e, task) => {
    e.stopPropagation()
    onChange?.(
      tasks.map((t) => {
        if (t.id !== task.id) return t
        const completed = !t.completed
        return {
          ...t,
          completed,
          completedAt: completed ? Date.now() : null,
        }
      })
    )
  }

  return (
    <>
      <div className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
        <div className={FINANCES_SUMMARY_ROW}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center justify-center shrink-0 mt-0.5"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse Initial Tasks' : 'Expand Initial Tasks'}
          >
            <ChevronDown
              className={cn(
                'h-[18px] w-[18px] opacity-50 transition-transform',
                collapsed && '-rotate-90'
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-sm font-medium truncate text-left min-w-0 flex-1 pt-0.5"
          >
            Initial Tasks
          </button>
          <span className="text-sm font-medium tabular-nums shrink-0 pt-0.5 opacity-70">
            {(collapsed || !expanded) && tasks.length > 0 ? countLabel : ''}
          </span>
          {expanded ? (
            <button
              type="button"
              className={FINANCES_OPTIONS_BTN}
              onClick={openAddTask}
              aria-label="Add task"
              title="Add task"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <FinancesOptionsSpacer />
          )}
        </div>

        {expanded && (
          <div className="px-3.5 pb-3 pt-2 space-y-2.5 border-t border-white/10 bg-white/[0.02]">
            {tasks.length === 0 ? (
              <p className="text-xs opacity-40 py-0.5">No tasks yet.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      task={pendingTaskForDisplay(task, lead, isTeamPipeline)}
                      displayLeads={displayLeads}
                      teams={teams}
                      hideLeadLine
                      onToggle={handleToggle}
                      onActivate={null}
                      onEdit={() => openEditTask(task)}
                      onDelete={() => deleteTask(task.id)}
                      onViewOnSchedule={null}
                      onOpenLead={null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <NewTaskDialog
        open={showTaskDialog}
        onOpenChange={(open) => {
          if (!open) closeTaskDialog()
        }}
        isEditMode={isEditMode}
        showContextCard={isEditMode}
        contextPrimary={contextPrimary}
        contextSecondary={leadLabel && contextPrimary !== leadLabel ? leadLabel : ''}
        contextTertiary={leadAddress}
        initialTitle={editingTask?.title || ''}
        initialLeadId={isEditMode ? null : lead?.id || null}
        initialDealId={isEditMode ? null : pendingDeal?.id || null}
        initialScheduledAt={editingTask?.scheduledAt ?? null}
        initialScheduledEndAt={editingTask?.scheduledEndAt ?? null}
        initialTeamAssignUids={editingTask?.assignedUids || []}
        leads={displayLeads}
        deals={pendingDeal ? [pendingDeal] : []}
        showDealPicker={!isEditMode}
        lockLead={!isEditMode}
        disableDealClear={!isEditMode}
        showTeamAssign={showTeamAssign}
        teamMembers={teamMembers}
        teamContextActive={teamContextActive}
        leadName={leadLabel || contextPrimary}
        leadAddress={leadAddress}
        onSubmit={handleSubmitTask}
        nestedOverlay
        topLayer
      />
    </>
  )
}

export default CreateDealTasksEditor
