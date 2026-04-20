/**
 * Team tasks client — wraps /api/pipelines-team-tasks for mutating teamTasks on a lead.
 * These tasks are stored on the pipeline document (lead.teamTasks) so they are
 * visible to every member of the teams the pipeline is shared with.
 */

async function postTeamTask(getToken, body) {
  const token = getToken ? await getToken() : null
  const res = await fetch('/api/pipelines-team-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let msg = 'Team task update failed'
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

export async function addTeamTask(getToken, pipelineId, leadId, task) {
  return postTeamTask(getToken, { pipelineId, leadId, action: 'add', task })
}

export async function updateTeamTask(getToken, pipelineId, leadId, task) {
  return postTeamTask(getToken, { pipelineId, leadId, action: 'update', task })
}

export async function removeTeamTask(getToken, pipelineId, leadId, taskId) {
  return postTeamTask(getToken, { pipelineId, leadId, action: 'remove', task: { id: taskId } })
}

export async function toggleTeamTask(getToken, pipelineId, leadId, taskId) {
  return postTeamTask(getToken, { pipelineId, leadId, action: 'toggle-complete', task: { id: taskId } })
}
