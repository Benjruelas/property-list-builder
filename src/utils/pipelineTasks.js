/**
 * Pipeline tasks client — wraps /api/pipelines-tasks for mutating tasks that
 * live on a pipeline document (pipeline.tasks). These tasks are visible to
 * every user the pipeline is shared with (owner, sharedWith email, teamShares).
 *
 * Task shape on the wire:
 *   { id, title, completed, createdAt, completedAt,
 *     scheduledAt, scheduledEndAt, parcelId, createdBy, createdByEmail }
 *
 * parcelId is optional — null means the task belongs to the pipe itself, not
 * to any specific lead.
 */

async function postPipelineTask(getToken, body) {
  const token = getToken ? await getToken() : null
  const res = await fetch('/api/pipelines-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let msg = 'Pipeline task update failed'
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      // ignore body parse failures
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function addPipelineTask(getToken, pipelineId, task) {
  return postPipelineTask(getToken, { pipelineId, action: 'add', task })
}

export async function updatePipelineTask(getToken, pipelineId, task) {
  return postPipelineTask(getToken, { pipelineId, action: 'update', task })
}

export async function removePipelineTask(getToken, pipelineId, taskId) {
  return postPipelineTask(getToken, { pipelineId, action: 'remove', task: { id: taskId } })
}

export async function togglePipelineTask(getToken, pipelineId, taskId) {
  return postPipelineTask(getToken, {
    pipelineId,
    action: 'toggle-complete',
    task: { id: taskId }
  })
}

/**
 * Flatten `pipelines[].tasks` into a single task array annotated with
 * pipelineId and __source='pipeline' so code downstream can route mutations
 * back to the right store.
 */
export function flattenPipelineTasks(pipelines) {
  if (!Array.isArray(pipelines)) return []
  const out = []
  for (const p of pipelines) {
    if (!p || !Array.isArray(p.tasks)) continue
    for (const t of p.tasks) {
      if (!t || !(t.title ?? '').toString().trim()) continue
      out.push({
        ...t,
        pipelineId: p.id,
        __source: 'pipeline'
      })
    }
  }
  return out
}

/**
 * Find pipelines that contain a given parcelId as a lead. Used to decide
 * whether a task creation flow can auto-select a pipe or must prompt.
 */
export function pipelinesContainingParcel(pipelines, parcelId) {
  if (!parcelId || !Array.isArray(pipelines)) return []
  return pipelines.filter((p) => Array.isArray(p.leads) && p.leads.some((l) => l.parcelId === parcelId))
}
