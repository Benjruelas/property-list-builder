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

export function mergePendingTaskToggles(tasks) {
  if (!pendingToggles.size || !Array.isArray(tasks)) return tasks
  return tasks.map((t) => {
    const pending = pendingToggles.get(t.id)
    if (!pending) return t
    return { ...t, completed: pending.completed, completedAt: pending.completedAt }
  })
}

function commitMatchingPendingToggles(tasks) {
  if (!pendingToggles.size || !Array.isArray(tasks)) return
  for (const [taskId, pending] of pendingToggles) {
    const fresh = tasks.find((t) => t.id === taskId)
    if (fresh && !!fresh.completed === pending.completed) {
      pendingToggles.delete(taskId)
    }
  }
}

export function reconcilePendingTaskToggles(tasks) {
  commitMatchingPendingToggles(tasks)
  return mergePendingTaskToggles(tasks)
}

export function taskListContentKey(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return ''
  return tasks
    .map((t) =>
      [
        t.id,
        t.completed ? '1' : '0',
        t.completedAt ?? '',
        t.title || '',
        t.scheduledAt ?? '',
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

export async function persistTaskToggle({ task, getToken }) {
  if (!getToken) throw new Error('Sign in to update tasks')
  await updateServerTeamTask(getToken, task.id, { completed: !task.completed })
}

export function createOptimisticTaskToggleHandler({
  setTaskList,
  getToken,
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
        await persistTaskToggle({ task: snapshot, getToken })
        onAfterLocalToggle?.()
      } catch (err) {
        clearPendingTaskToggle(snapshot.id)
        setTaskList((prev) => prev.map((t) => (t.id === snapshot.id ? snapshot : t)))
        onError?.(err)
      }
    })()
  }
}
