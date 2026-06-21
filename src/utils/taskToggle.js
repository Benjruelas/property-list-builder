import { toggleLeadTask } from './leadTasks'
import { togglePipelineTask } from './pipelineTasks'
import { toggleTeamTask } from './teamTasks'
import { updateTeamTask as updateServerTeamTask } from './tasks'

/** In-flight checkbox toggles — keeps server refreshes from briefly reverting UI. */
const pendingToggles = new Map()

/** Next completed state for a task row (UI + local optimistic updates). */
export function getToggledTask(task) {
  const completed = !task.completed
  return {
    ...task,
    completed,
    completedAt: completed ? Date.now() : null,
  }
}

export function toggleTaskInList(tasks, taskId) {
  return tasks.map((t) => (t.id === taskId ? getToggledTask(t) : t))
}

export function registerPendingTaskToggle(taskId, toggledTask) {
  if (!taskId || !toggledTask) return
  pendingToggles.set(taskId, {
    completed: !!toggledTask.completed,
    completedAt: toggledTask.completedAt ?? null,
  })
}

export function clearPendingTaskToggle(taskId) {
  if (taskId) pendingToggles.delete(taskId)
}

/** Overlay in-flight toggles onto a freshly built task list from pipelines/storage. */
export function mergePendingTaskToggles(tasks) {
  if (!pendingToggles.size || !Array.isArray(tasks)) return tasks
  return tasks.map((t) => {
    const pending = pendingToggles.get(t.id)
    if (!pending) return t
    return { ...t, completed: pending.completed, completedAt: pending.completedAt }
  })
}

/** Drop pending entries once server data matches the optimistic completed state. */
function commitMatchingPendingToggles(tasks) {
  if (!pendingToggles.size || !Array.isArray(tasks)) return
  for (const [taskId, pending] of pendingToggles) {
    const fresh = tasks.find((t) => t.id === taskId)
    if (fresh && !!fresh.completed === pending.completed) {
      pendingToggles.delete(taskId)
    }
  }
}

/** Apply pending overlays and auto-clear when refresh data caught up. */
export function reconcilePendingTaskToggles(tasks) {
  commitMatchingPendingToggles(tasks)
  return mergePendingTaskToggles(tasks)
}

/** Stable fingerprint for comparing task list snapshots (ignores object identity). */
export function taskListContentKey(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return ''
  return tasks
    .map((t) =>
      [
        t.id,
        t.__source || '',
        t.completed ? '1' : '0',
        t.completedAt ?? '',
        t.title || '',
        t.scheduledAt ?? '',
        t.dueAt ?? '',
        t.scheduledEndAt ?? '',
        t.dealId ?? '',
      ].join(':')
    )
    .join('|')
}

export function setTasksWithPendingMerge(setTaskList, freshTasks) {
  setTaskList((prev) => {
    const merged = reconcilePendingTaskToggles(freshTasks)
    if (taskListContentKey(prev) === taskListContentKey(merged)) return prev
    return merged
  })
}

/** Persist toggle to API or localStorage (call after optimistic UI update). */
export async function persistTaskToggle({ task, getToken, onPipelinesChange, scheduleSync }) {
  if (task.__source === 'server' && getToken) {
    await updateServerTeamTask(getToken, task.id, { completed: !task.completed })
    return
  }
  if (task.__source === 'team' && task.pipelineId && task.leadId) {
    await toggleTeamTask(getToken, task.pipelineId, task.leadId, task.id)
    if (onPipelinesChange) await onPipelinesChange()
    return
  }
  if (task.__source === 'pipeline' && task.pipelineId) {
    await togglePipelineTask(getToken, task.pipelineId, task.id)
    if (onPipelinesChange) await onPipelinesChange()
    return
  }
  toggleLeadTask(task.parcelId, task.id)
  scheduleSync?.()
}

/**
 * Checkbox handler: flip task in list immediately, persist in background, revert on error.
 */
export function createOptimisticTaskToggleHandler({
  setTaskList,
  getToken,
  onPipelinesChange,
  scheduleSync,
  onAfterLocalToggle,
  onError,
}) {
  return (e, task) => {
    e.stopPropagation()
    const snapshot = task
    const toggled = getToggledTask(snapshot)
    registerPendingTaskToggle(snapshot.id, toggled)
    setTaskList((prev) => toggleTaskInList(prev, snapshot.id))
    void (async () => {
      try {
        await persistTaskToggle({ task: snapshot, getToken, onPipelinesChange, scheduleSync })
        if (
          snapshot.__source !== 'team' &&
          snapshot.__source !== 'pipeline' &&
          snapshot.__source !== 'server'
        ) {
          onAfterLocalToggle?.()
        }
      } catch (err) {
        clearPendingTaskToggle(snapshot.id)
        setTaskList((prev) => prev.map((t) => (t.id === snapshot.id ? snapshot : t)))
        onError?.(err)
      }
    })()
  }
}
