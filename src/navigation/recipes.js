/**
 * Navigation recipes — frozen mappings from legacy open/close helpers to stack operations.
 * Each recipe returns { navStack, mapOverlayStack?, modalStack?, meta? } patches or action lists.
 */

/**
 * closePrimaryPanelsExcept(keep) — rebuild stack keeping allowed roots.
 * @param {import('./types.js').NavFrame[]} currentStack
 * @param {Record<string, boolean>} keep
 * @param {import('./types.js').NavFrame[]} [append]
 */
export function recipeClosePrimaryExcept(currentStack, keep, append = []) {
  const filtered = []
  for (const frame of currentStack) {
    const root = frame.type.split('.')[0]
    const map = {
      list: frame.type === 'lists' || frame.type === 'lists.parcels',
      leads: root === 'leads',
      deals: root === 'deals',
      pipes: root === 'pipes',
      tasks: root === 'tasks',
      schedule: root === 'schedule',
      paths: root === 'paths',
      forms: root === 'forms',
      quotes: root === 'quotes',
      reports: root === 'reports',
      teams: root === 'teams',
      settings: root === 'settings',
      outreach: root === 'outreach',
      skipTraced: root === 'skipTraced',
      activity: root === 'activity',
    }
    const key = Object.keys(map).find((k) => map[k])
    if (key && keep[key]) filtered.push(frame)
    else if (!key) filtered.push(frame)
    else break
  }
  return [...filtered, ...append]
}

/** Legacy: openLeadsPanel */
export function recipeOpenLeads(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { leads: true }, [{ type: 'leads' }])
}

/** Legacy: openDealsPanel */
export function recipeOpenDeals(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { deals: true }, [{ type: 'deals' }])
}

/** Legacy: openDealPipeline */
export function recipeOpenPipes(currentStack, pipelineId) {
  const frames = [{ type: 'pipes', pipelineId }]
  return recipeClosePrimaryExcept(currentStack, { pipes: true }, frames)
}

/** Legacy: openTasks */
export function recipeOpenTasks(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { tasks: true }, [{ type: 'tasks' }])
}

/** Legacy: openSchedule (standalone, clears schedule stack) */
export function recipeOpenSchedule(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { schedule: true }, [{ type: 'schedule' }])
}

/** Legacy: openListPanel */
export function recipeOpenLists(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { list: true }, [{ type: 'lists' }])
}

/** Legacy: openPathsPanel */
export function recipeOpenPaths(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { paths: true }, [{ type: 'paths' }])
}

/** Legacy: openFormsPanel */
export function recipeOpenForms(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { forms: true }, [{ type: 'forms' }])
}

/** Legacy: openQuotesPanel */
export function recipeOpenQuotes(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { quotes: true }, [{ type: 'quotes' }])
}

/** Legacy: openReportsPanel */
export function recipeOpenReports(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { reports: true }, [{ type: 'reports' }])
}

/** Legacy: openTeamsPanel */
export function recipeOpenTeams(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { teams: true }, [{ type: 'teams' }])
}

/** Legacy: openSettingsPanel — stacks on top, does NOT close other panels */
export function recipeOpenSettings(currentStack) {
  if (currentStack.some((f) => f.type === 'settings')) return currentStack
  return [...currentStack, { type: 'settings' }]
}

function activityPrefix(currentStack) {
  return currentStack[0]?.type === 'activity' ? [currentStack[0]] : []
}

/** Legacy: openLeadDetails */
export function recipeOpenLeadDetails(currentStack, leadId) {
  const fromActivity = currentStack[0]?.type === 'activity'
  const keep = { leads: true, ...(fromActivity ? { activity: true } : {}) }
  const withoutDetail = currentStack.filter((f) => f.type !== 'leads.detail')
  const base = recipeClosePrimaryExcept(withoutDetail, keep, [])
  const hasLeads = base.some((f) => f.type === 'leads')
  const stack = hasLeads ? base : [...base, { type: 'leads' }]
  return [...stack, { type: 'leads.detail', leadId }]
}

/** Legacy: handleCreateQuoteForDeal */
export function recipeOpenQuoteEditorFromDeal(currentStack, prefill) {
  const kept = recipeClosePrimaryExcept(currentStack, { quotes: true, pipes: true, deals: true }, [])
  const hasQuotes = kept.some((f) => f.type === 'quotes')
  const stack = hasQuotes ? kept : [...kept, { type: 'quotes' }]
  return [
    ...stack.filter((f) => f.type !== 'quotes.editor' && f.type !== 'quotes.detail'),
    { type: 'quotes.editor', prefill },
  ]
}

/** Open quote details from deal/pipes while keeping deal visible underneath */
export function recipeOpenQuoteDetailFromDeal(currentStack, quoteId, quote = null) {
  const kept = recipeClosePrimaryExcept(currentStack, { quotes: true, pipes: true, deals: true }, [])
  const hasQuotes = kept.some((f) => f.type === 'quotes')
  const stack = hasQuotes ? kept : [...kept, { type: 'quotes' }]
  return [
    ...stack.filter((f) => f.type !== 'quotes.detail' && f.type !== 'quotes.editor'),
    { type: 'quotes.detail', quoteId, quote: quote || undefined, returnToDeal: true },
  ]
}

/** Legacy: openScheduleAtDate — push schedule on current stack */
export function recipeOpenScheduleAtDate(currentStack, initialDate) {
  const withoutSchedule = currentStack.filter((f) => frameRoot(f.type) !== 'schedule')
  return [...withoutSchedule, { type: 'schedule', initialDate: initialDate ?? undefined }]
}

/** Push active deal detail — replaces any competing closed/lead overlays. */
export function recipePushDealsDetail(currentStack, dealId, pipelineId) {
  const filtered = currentStack.filter(
    (f) => f.type !== 'deals.closed' && f.type !== 'deals.lead' && f.type !== 'deals.detail',
  )
  return [...filtered, { type: 'deals.detail', dealId, pipelineId }]
}

/** Push closed deal view — replaces any competing active deal/lead overlays. */
export function recipePushDealsClosed(currentStack, closedRecordId) {
  const filtered = currentStack.filter(
    (f) => f.type !== 'deals.detail' && f.type !== 'deals.lead' && f.type !== 'deals.closed',
  )
  return [...filtered, { type: 'deals.closed', closedRecordId }]
}

/** Legacy: Leads → open deal in pipes */
export function recipeOpenDealInPipes(currentStack, pipelineId, dealId) {
  return [
    ...activityPrefix(currentStack),
    { type: 'pipes', pipelineId },
    { type: 'pipes.deal', dealId },
  ]
}

/** Legacy: handleOpenTaskInDealPipeline */
export function recipeOpenTaskInPipes(currentStack, pipelineId, dealId) {
  return [
    ...activityPrefix(currentStack),
    { type: 'pipes', pipelineId },
    { type: 'pipes.deal', dealId },
  ]
}

/** Legacy: handleActivityNavigate */
export function recipeNavigateFromActivity(currentStack, destinationFrames) {
  return [{ type: 'activity' }, ...destinationFrames]
}

/** Legacy: returnFromActivityDestination */
export function recipeReturnToActivity() {
  return [{ type: 'activity' }]
}

function frameRoot(type) {
  return type.split('.')[0]
}

export function recipeViewListContents(currentStack, listId) {
  const base = recipeClosePrimaryExcept(currentStack, { list: true }, [{ type: 'lists' }])
  const hasLists = base.some((f) => f.type === 'lists')
  const stack = hasLists ? base : [...base, { type: 'lists' }]
  return [...stack.filter((f) => f.type !== 'lists.parcels'), { type: 'lists.parcels', listId }]
}

export function recipeOpenSkipTraced(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { skipTraced: true }, [{ type: 'skipTraced' }])
}

export function recipeOpenOutreach(currentStack, initialTab = 'email') {
  return recipeClosePrimaryExcept(currentStack, { outreach: true }, [{ type: 'outreach', initialTab }])
}

export function recipeOpenEmailComposer(currentStack, payload) {
  return [...currentStack.filter((f) => f.type !== 'emailComposer'), { type: 'emailComposer', payload }]
}

export function recipeOpenBulkEmailPreview(currentStack, listId) {
  return [...currentStack.filter((f) => f.type !== 'bulkEmailPreview'), { type: 'bulkEmailPreview', listId }]
}
