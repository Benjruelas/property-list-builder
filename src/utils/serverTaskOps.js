/**
 * Unified server task CRUD — all UI paths use /api/tasks after migration.
 */

import { createTeamTask, updateTeamTask, deleteTeamTask } from './tasks'
import { resolveTaskContext } from './taskCreateFlow'

export async function createServerTask(getToken, {
  title,
  scheduledAt = null,
  scheduledEndAt = null,
  assignedUids = [],
  leadId = null,
  dealId = null,
  deal = null,
  leads = [],
  pipelines = [],
  pipelineId = null,
  notes = null,
  parcelId = null,
}) {
  if (!getToken) throw new Error('Sign in to create tasks')
  const ctx = resolveTaskContext({ leadId, dealId, deal, leads, pipelines })
  return createTeamTask(getToken, {
    title,
    assignedUids,
    leadId: ctx.leadId,
    dealId: ctx.dealId,
    pipelineId: pipelineId || ctx.pipelineId,
    parcelId: parcelId || ctx.parcelId,
    scheduledAt,
    scheduledEndAt,
    notes,
  })
}

export async function patchServerTask(getToken, taskId, patch) {
  if (!getToken) throw new Error('Sign in required')
  return updateTeamTask(getToken, taskId, patch)
}

export async function removeServerTask(getToken, taskId) {
  if (!getToken) throw new Error('Sign in required')
  return deleteTeamTask(getToken, taskId)
}

export async function toggleServerTask(getToken, task, completed) {
  return patchServerTask(getToken, task.id, { completed })
}
