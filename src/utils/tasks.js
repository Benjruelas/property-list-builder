/**
 * Client for server-backed team tasks (/api/tasks).
 */

import { getApiBase } from './apiBase'

async function apiCall(getToken, method, body = null) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${getApiBase()}/tasks`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export async function fetchTeamTasks(getToken) {
  try {
    const data = await apiCall(getToken, 'GET')
    return { tasks: data.tasks || [], teamId: data.teamId || null }
  } catch {
    return { tasks: [], teamId: null }
  }
}

export async function createTeamTask(getToken, task) {
  const data = await apiCall(getToken, 'POST', task)
  return data.task
}

export async function updateTeamTask(getToken, taskId, patch) {
  const data = await apiCall(getToken, 'PATCH', { taskId, ...patch })
  return data.task
}

export async function deleteTeamTask(getToken, taskId) {
  await apiCall(getToken, 'DELETE', { taskId })
}
