/**
 * Maps notification feed types to navigation stack frames.
 * Mirrors handleNotificationNavigate in App.jsx.
 */

/**
 * @param {object} data
 * @param {object} ctx
 * @param {Array<{ id: string }>} ctx.leads
 * @param {Array<{ id: string }>} ctx.pipelines
 * @param {Array<{ id: string }>} ctx.lists
 * @returns {{ ok: boolean, frames?: import('./types.js').NavFrame[], pipelineId?: string, listId?: string, toast?: string }}
 */
export function feedDataToFrames(data, ctx) {
  if (!data?.type) return { ok: false }

  const { type } = data
  const { leads, pipelines, lists } = ctx

  if (type === 'lead' && data.leadId) {
    if (!leads.some((l) => l.id === data.leadId)) {
      return { ok: false, toast: "You don't have access to this lead" }
    }
    return {
      ok: true,
      frames: [{ type: 'leads' }, { type: 'leads.detail', leadId: data.leadId }],
    }
  }

  if (type === 'deal' && data.dealId) {
    if (data.pipelineId && !pipelines.some((p) => p.id === data.pipelineId)) {
      return { ok: false, toast: "You don't have access to this deal" }
    }
    const pipelineId = data.pipelineId
    return {
      ok: true,
      pipelineId,
      frames: [
        { type: 'pipes', pipelineId },
        { type: 'pipes.deal', dealId: data.dealId },
      ],
    }
  }

  if (type === 'pipeline' && data.pipelineId) {
    if (!pipelines.some((p) => p.id === data.pipelineId)) {
      return { ok: false, toast: "You don't have access to this pipe" }
    }
    return {
      ok: true,
      pipelineId: data.pipelineId,
      frames: [{ type: 'pipes', pipelineId: data.pipelineId }],
    }
  }

  if (type === 'task' || type === 'taskDeadline') {
    return { ok: true, frames: [{ type: 'tasks' }] }
  }

  if (type === 'schedule') {
    return { ok: true, frames: [{ type: 'schedule' }] }
  }

  if ((type === 'listShared' || type === 'list') && data.listId) {
    if (!lists.some((l) => l.id === data.listId)) {
      return { ok: false, toast: "You don't have access to this list" }
    }
    return { ok: true, listId: data.listId, frames: [{ type: 'lists' }] }
  }

  if (type === 'pipelineShared' || type === 'pipelineLeadStage') {
    if (data.pipelineId && !pipelines.some((p) => p.id === data.pipelineId)) {
      return { ok: false, toast: "You don't have access to this pipe" }
    }
    return {
      ok: true,
      pipelineId: data.pipelineId,
      frames: [{ type: 'pipes', pipelineId: data.pipelineId }],
    }
  }

  if (type === 'pathShared' || type === 'path') {
    return { ok: true, frames: [{ type: 'paths' }] }
  }

  if (type === 'formSubmitted' || type === 'form') {
    return { ok: true, frames: [{ type: 'forms' }] }
  }

  if (type === 'teamAdded' || type === 'team') {
    return { ok: true, frames: [{ type: 'teams' }] }
  }

  return { ok: false }
}
