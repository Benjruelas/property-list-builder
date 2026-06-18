/**
 * Maps notification feed types to navigation stack frames.
 * Mirrors handleNotificationNavigate in App.jsx.
 *
 * @param {object} data
 * @param {object} ctx
 * @param {Array<{ id: string }>} ctx.leads
 * @param {Array<{ id: string }>} ctx.pipelines
 * @param {Array<{ id: string }>} ctx.lists
 * @param {object} [opts]
 * @param {boolean} [opts.standaloneDetail=false] — detail/destination only, no parent list/pipe panel (activity feed)
 * @returns {{ ok: boolean, frames?: import('./types.js').NavFrame[], pipelineId?: string, listId?: string, pathId?: string, toast?: string }}
 */
export function feedDataToFrames(data, ctx, opts = {}) {
  if (!data?.type && data?.panel !== 'quotes') return { ok: false }

  const { standaloneDetail = false } = opts
  const { leads, pipelines, lists } = ctx
  const type = normalizeFeedType(data)

  if (data.panel === 'quotes' && data.quoteId) {
    return {
      ok: true,
      frames: standaloneDetail
        ? [{ type: 'quotes.detail', quoteId: data.quoteId }]
        : [{ type: 'quotes' }, { type: 'quotes.detail', quoteId: data.quoteId }],
    }
  }

  if ((type === 'lead' || type === 'pipelineleadstage') && data.leadId) {
    if (!leads.some((l) => l.id === data.leadId)) {
      return { ok: false, toast: "You don't have access to this lead" }
    }
    return {
      ok: true,
      frames: standaloneDetail
        ? [{ type: 'leads.detail', leadId: data.leadId }]
        : [{ type: 'leads.detail', leadId: data.leadId, returnToLeadsList: true }],
    }
  }

  if ((type === 'deal' || type === 'pipelinedealstage') && data.dealId) {
    if (data.pipelineId && !pipelines.some((p) => p.id === data.pipelineId)) {
      return { ok: false, toast: "You don't have access to this deal" }
    }
    const pipelineId = data.pipelineId
    return {
      ok: true,
      pipelineId,
      frames: standaloneDetail
        ? [{ type: 'deals.detail', dealId: data.dealId, pipelineId }]
        : [
            { type: 'pipes', pipelineId },
            { type: 'deals.detail', dealId: data.dealId, pipelineId, returnToPipesList: true },
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
      frames: standaloneDetail
        ? []
        : [{ type: 'pipes', pipelineId: data.pipelineId }],
    }
  }

  if (type === 'task' || type === 'taskdeadline' || type === 'taskassigned') {
    return { ok: true, frames: [{ type: 'tasks' }] }
  }

  if (type === 'schedule') {
    return { ok: true, frames: [{ type: 'schedule' }] }
  }

  if ((type === 'listshared' || type === 'list') && data.listId) {
    if (!lists.some((l) => l.id === data.listId)) {
      return { ok: false, toast: "You don't have access to this list" }
    }
    return {
      ok: true,
      listId: data.listId,
      frames: standaloneDetail
        ? [{ type: 'lists.parcels', listId: data.listId }]
        : [{ type: 'lists' }],
    }
  }

  if (type === 'pipelineshared' || type === 'pipelineleadstage') {
    if (data.pipelineId && !pipelines.some((p) => p.id === data.pipelineId)) {
      return { ok: false, toast: "You don't have access to this pipe" }
    }
    return {
      ok: true,
      pipelineId: data.pipelineId,
      frames: standaloneDetail
        ? []
        : [{ type: 'pipes', pipelineId: data.pipelineId }],
    }
  }

  if (type === 'pathshared' || type === 'path') {
    return {
      ok: true,
      pathId: data.pathId,
      frames: standaloneDetail ? [] : [{ type: 'paths' }],
    }
  }

  if (type === 'formsubmitted' || type === 'form') {
    if (data.templateId) {
      return {
        ok: true,
        frames: standaloneDetail
          ? [{ type: 'forms.fill', templateId: data.templateId }]
          : [{ type: 'forms' }, { type: 'forms.fill', templateId: data.templateId }],
      }
    }
    return { ok: true, frames: [{ type: 'forms' }] }
  }

  if (type === 'teamadded' || type === 'team') {
    if (data.teamId) {
      return {
        ok: true,
        frames: standaloneDetail
          ? [{ type: 'settings' }, { type: 'teams.detail', teamId: data.teamId }]
          : [{ type: 'settings' }, { type: 'teams.detail', teamId: data.teamId }],
      }
    }
    return { ok: true, frames: [{ type: 'settings' }] }
  }

  return { ok: false }
}

function normalizeFeedType(data) {
  return String(data?.type || '').toLowerCase()
}
