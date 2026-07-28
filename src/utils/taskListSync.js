/**
 * Shared task list merge — server-backed tasks only after unified migration.
 */

import { fetchAllServerTasks } from './taskMigration'
import { normalizeServerTask } from './taskCreateFlow'

/** @deprecated pipelines ignored — kept for call-site compatibility. */
export async function resolvePipelinesForTasks(getToken, pipelines = []) {
  return pipelines
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

export function buildVisibleTaskList() {
  return []
}

export async function buildVisibleTaskListFresh({ getToken }) {
  if (!getToken) return []
  return fetchAllServerTasks(getToken)
}
