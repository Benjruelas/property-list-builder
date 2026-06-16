/**
 * Shared task list merge — keeps Tasks panel and deal/lead task sections in sync.
 */

import { getAllTasks, getPersonalTasks } from './leadTasks'
import { flattenPipelineTasks } from './pipelineTasks'
import { flattenTeamTasks } from './teamTaskUtils'
import { fetchPipelines } from './pipelines'
import { fetchTeamTasks } from './tasks'
import { normalizeServerTask } from './taskCreateFlow'

/** Prefer freshly fetched pipelines so new tasks appear immediately after create. */
export async function resolvePipelinesForTasks(getToken, pipelines = []) {
  if (!getToken) return pipelines
  try {
    const fresh = await fetchPipelines(getToken)
    return Array.isArray(fresh) && fresh.length > 0 ? fresh : pipelines
  } catch {
    return pipelines
  }
}

export function mergeServerTasksIntoList(merged, serverTasks) {
  if (!serverTasks?.length) return merged
  const ids = new Set(merged.map((t) => t.id))
  const out = [...merged]
  for (const t of serverTasks) {
    if (ids.has(t.id)) continue
    out.push(normalizeServerTask(t))
    ids.add(t.id)
  }
  return out
}

/**
 * Same sources as TasksPanel — personal, pipeline, team, and server-assigned tasks.
 */
export function buildVisibleTaskList({ pipelines = [], getToken, teams }) {
  const apiMode = Array.isArray(pipelines) && pipelines.length > 0
  let merged = apiMode
    ? [...getPersonalTasks(), ...flattenPipelineTasks(pipelines), ...flattenTeamTasks(pipelines)]
    : getAllTasks()

  if (getToken && teams?.length > 0) {
    // Server tasks merged async in buildVisibleTaskListFresh
    return merged
  }
  return merged
}

export async function buildVisibleTaskListFresh({ pipelines = [], getToken, teams }) {
  const pipeData = await resolvePipelinesForTasks(getToken, pipelines)
  let merged = buildVisibleTaskList({ pipelines: pipeData, getToken, teams })

  if (getToken && teams?.length > 0) {
    try {
      const { tasks: serverTasks } = await fetchTeamTasks(getToken)
      merged = mergeServerTasksIntoList(merged, serverTasks)
    } catch {
      /* ignore */
    }
  }

  return merged
}
