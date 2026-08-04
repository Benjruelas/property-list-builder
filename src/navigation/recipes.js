/**
 * Navigation recipes — frozen mappings from legacy open/close helpers to stack operations.
 * Each recipe returns { navStack, mapOverlayStack?, modalStack?, meta? } patches or action lists.
 */

import { frameRoot } from './types.js'
import { appendTrailingTasks, collectDockableKeepFlags, splitTrailingTasks, stackHasTasks, TASKS_DOCKABLE_ROOTS } from './taskDock.js'

/**
 * Desktop dock: replace the current primary panel but keep Tasks on the right.
 * @param {import('./types.js').NavFrame[]} currentStack
 * @param {import('./types.js').NavFrame} frame
 */
export function recipeSwapPrimaryKeepTasks(currentStack, frame) {
  const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
  const frameRootKey = frameRoot(frame.type)
  const rest = currentStack.filter((f) => {
    if (frameRoot(f.type) === 'tasks') return false
    if (TASKS_DOCKABLE_ROOTS.has(frameRoot(f.type))) return false
    return true
  })
  const withoutSameRoot = rest.filter((f) => frameRoot(f.type) !== frameRootKey)
  return [...withoutSameRoot, frame, ...tasksFrames]
}

/**
 * Open a root panel, optionally keeping Tasks docked on desktop.
 * @param {import('./types.js').NavFrame[]} currentStack
 * @param {string} rootKey — keep map key (e.g. 'leads', 'list')
 * @param {import('./types.js').NavFrame} frame
 * @param {{ keepTasks?: boolean }} [opts]
 */
function recipeOpenRootPanel(currentStack, rootKey, frame, opts = {}) {
  if (opts.keepTasks && stackHasTasks(currentStack)) {
    return recipeSwapPrimaryKeepTasks(currentStack, frame)
  }
  const keep = { [rootKey]: true }
  if (opts.keepTasks) keep.tasks = true
  const filtered = recipeClosePrimaryExcept(currentStack, keep, [])
  const frameRootKey = frameRoot(frame.type)
  const withoutSameRoot = filtered.filter((f) => frameRoot(f.type) !== frameRootKey)
  return [...withoutSameRoot, frame]
}

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
export function recipeOpenLeads(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'leads', { type: 'leads' }, opts)
}

/** Legacy: openDealsPanel */
export function recipeOpenDeals(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'deals', { type: 'deals' }, opts)
}

/** Legacy: openDealPipeline */
export function recipeOpenPipes(currentStack, pipelineId, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'pipes', { type: 'pipes', pipelineId }, opts)
}

/** Close Tasks only — leave any primary panel in the stack. */
export function recipeCloseTasks(currentStack) {
  return currentStack.filter((f) => f.type !== 'tasks')
}

/** Legacy: openTasks */
export function recipeOpenTasks(currentStack, opts = {}) {
  const keep = { tasks: true }
  if (opts.keepPrimary) {
    Object.assign(keep, collectDockableKeepFlags(currentStack))
  }
  const filtered = recipeClosePrimaryExcept(currentStack, keep, [])
  if (filtered.some((f) => f.type === 'tasks')) return filtered
  return [...filtered, { type: 'tasks' }]
}

/** Legacy: openSchedule (standalone, clears schedule stack) */
export function recipeOpenSchedule(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { schedule: true }, [{ type: 'schedule' }])
}

/** Legacy: openListPanel */
export function recipeOpenLists(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'list', { type: 'lists' }, opts)
}

/** Legacy: openPathsPanel */
export function recipeOpenPaths(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'paths', { type: 'paths' }, opts)
}

/** Legacy: openFormsPanel */
export function recipeOpenForms(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'forms', { type: 'forms' }, opts)
}

/** Legacy: openQuotesPanel */
export function recipeOpenQuotes(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'quotes', { type: 'quotes' }, opts)
}

/** Legacy: openReportsPanel */
export function recipeOpenReports(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'reports', { type: 'reports' }, opts)
}

/**
 * Open a blank quote editor directly, preserving the current surface for Back
 * without manufacturing a Quotes list parent.
 */
export function recipeOpenNewQuoteEditor(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const withoutEditor = coreStack.filter(
    (f) => f.type !== 'quotes.editor' && f.type !== 'quotes.detail',
  )
  return appendTrailingTasks(
    [...withoutEditor, { type: 'quotes.editor', mode: 'quote' }],
    tasksFrames,
  )
}

/**
 * Open a blank report editor directly, preserving the current surface for Back
 * without manufacturing a Reports list parent.
 */
export function recipeOpenNewReportEditor(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const withoutEditor = coreStack.filter(
    (f) => f.type !== 'reports.editor' && f.type !== 'reports.detail',
  )
  return appendTrailingTasks(
    [...withoutEditor, { type: 'reports.editor', mode: 'report' }],
    tasksFrames,
  )
}

function stackHasReportsSurface(stack) {
  return stack.some(
    (f) => f.type === 'reports' || f.type === 'reports.detail' || f.type === 'reports.editor',
  )
}

function stackHasLeadContext(stack) {
  return stack.some((f) => f.type === 'leads.detail')
}

/** True when reports detail/editor should restore lead on back (opened from lead). */
function reportsReturnToLead(stack) {
  return (
    stackHasLeadContext(stack) ||
    stack.some(
      (f) => (f.type === 'reports.detail' || f.type === 'reports.editor') && f.returnToLead,
    )
  )
}

/**
 * Open report detail in one stack replace.
 * Ensures the Reports list frame exists and swaps to reports as primary when needed,
 * so callers never flash a list-only (or empty) frame before detail.
 */
export function recipePushReportsDetail(currentStack, reportId, opts = {}) {
  const returnToLead = reportsReturnToLead(currentStack)
  const report = opts.report || null
  const base = stackHasReportsSurface(currentStack)
    ? currentStack
    : returnToLead
      ? recipeClosePrimaryExcept(currentStack, { reports: true, leads: true }, [])
      : recipeOpenReports(currentStack, opts)
  const { tasksFrames, coreStack } = splitTrailingTasks(base)
  const withoutNested = coreStack.filter(
    (f) => f.type !== 'reports.detail' && f.type !== 'reports.editor',
  )
  const withList = returnToLead
    ? withoutNested.filter((f) => f.type !== 'reports')
    : withoutNested.some((f) => f.type === 'reports')
      ? withoutNested
      : [...withoutNested, { type: 'reports' }]
  return appendTrailingTasks(
    [
      ...withList,
      {
        type: 'reports.detail',
        reportId,
        ...(report ? { report } : {}),
        ...(returnToLead ? { returnToLead: true } : {}),
      },
    ],
    tasksFrames,
  )
}

/**
 * Open report editor in one stack replace (same atomic open as detail).
 */
export function recipePushReportsEditor(currentStack, editorFrame, opts = {}) {
  const returnToLead = reportsReturnToLead(currentStack)
  const base = stackHasReportsSurface(currentStack)
    ? currentStack
    : returnToLead
      ? recipeClosePrimaryExcept(currentStack, { reports: true, leads: true }, [])
      : recipeOpenReports(currentStack, opts)
  const { tasksFrames, coreStack } = splitTrailingTasks(base)
  const withoutNested = coreStack.filter(
    (f) => f.type !== 'reports.detail' && f.type !== 'reports.editor',
  )
  const withList = returnToLead
    ? withoutNested.filter((f) => f.type !== 'reports')
    : withoutNested.some((f) => f.type === 'reports')
      ? withoutNested
      : [...withoutNested, { type: 'reports' }]
  return appendTrailingTasks(
    [
      ...withList,
      { type: 'reports.editor', ...editorFrame, ...(returnToLead ? { returnToLead: true } : {}) },
    ],
    tasksFrames,
  )
}

/**
 * Open report detail from lead context — no Reports list panel.
 * Keeps lead detail (and optional leads list) in the stack for back navigation.
 */
export function recipeOpenReportFromLeadDetail(currentStack, reportId, opts = {}) {
  const report = opts.report || null
  const stripReportFrames = (f) =>
    f.type !== 'reports.detail' &&
    f.type !== 'reports.editor' &&
    f.type !== 'reports'
  const stripTransientList = (f) => f.type !== 'leads' && f.type !== 'reports'

  const build = (stack) => [
    ...stack.filter(stripReportFrames).filter(stripTransientList),
    {
      type: 'reports.detail',
      reportId,
      ...(report ? { report } : {}),
      returnToLead: true,
      dockBesideTasks: true,
    },
  ]

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/**
 * Open report editor from lead context — no Reports list panel.
 */
export function recipeOpenReportEditorFromLeadDetail(currentStack, editorFrame, opts = {}) {
  const stripReportFrames = (f) =>
    f.type !== 'reports.detail' &&
    f.type !== 'reports.editor' &&
    f.type !== 'reports'
  const stripTransientList = (f) => f.type !== 'leads' && f.type !== 'reports'

  const build = (stack) => [
    ...stack.filter(stripReportFrames).filter(stripTransientList),
    { type: 'reports.editor', ...editorFrame, returnToLead: true, dockBesideTasks: true },
  ]

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/**
 * Open form fill from lead context — no Forms list panel.
 */
export function recipeOpenFormFillFromLeadDetail(currentStack, templateId, opts = {}) {
  const leadId = opts.leadId || null
  const stripFormFrames = (f) =>
    f.type !== 'forms.fill' &&
    f.type !== 'forms.edit' &&
    f.type !== 'forms'
  const stripTransientList = (f) => f.type !== 'leads' && f.type !== 'forms'

  const build = (stack) => [
    ...stack.filter(stripFormFrames).filter(stripTransientList),
    {
      type: 'forms.fill',
      templateId,
      ...(leadId ? { leadId } : {}),
      returnToLead: true,
      dockBesideTasks: true,
    },
  ]

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/**
 * Open form editor from lead context — no Forms list panel.
 */
export function recipeOpenFormEditFromLeadDetail(currentStack, templateId, opts = {}) {
  const leadId = opts.leadId || null
  const stripFormFrames = (f) =>
    f.type !== 'forms.fill' &&
    f.type !== 'forms.edit' &&
    f.type !== 'forms'
  const stripTransientList = (f) => f.type !== 'leads' && f.type !== 'forms'

  const build = (stack) => [
    ...stack.filter(stripFormFrames).filter(stripTransientList),
    {
      type: 'forms.edit',
      templateId,
      ...(leadId ? { leadId } : {}),
      returnToLead: true,
      returnToFormPicker: opts.returnToFormPicker === true,
      dockBesideTasks: true,
    },
  ]

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/** Legacy: openTeamsPanel */
export function recipeOpenTeams(currentStack, opts = {}) {
  return recipeOpenRootPanel(currentStack, 'teams', { type: 'teams' }, opts)
}

/** Legacy: openSettingsPanel — stacks on top, does NOT close other panels */
export function recipeOpenSettings(currentStack) {
  if (currentStack.some((f) => f.type === 'settings')) return currentStack
  return [...currentStack, { type: 'settings' }]
}

function activityPrefix(currentStack) {
  return currentStack[0]?.type === 'activity' ? [currentStack[0]] : []
}

/** Open lead detail as the primary panel; keeps Leads list mounted underneath for Back. */
export function recipeOpenLeadDetails(currentStack, leadId, opts = {}) {
  const build = (stack) => {
    const fromActivity = stack[0]?.type === 'activity'
    const hadLeadsList = stack.some((f) => f.type === 'leads')
    const keep = { ...(fromActivity ? { activity: true } : {}) }
    const withoutLeadFrames = stack.filter((f) => f.type !== 'leads' && f.type !== 'leads.detail')
    const base = recipeClosePrimaryExcept(withoutLeadFrames, keep, [])
    const keepList = hadLeadsList && !fromActivity
    return [
      ...base,
      ...(keepList ? [{ type: 'leads' }] : []),
      {
        type: 'leads.detail',
        leadId,
        ...(keepList ? { returnToLeadsList: true } : {}),
      },
    ]
  }

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/** Back from promoted lead detail → Leads list when opened from it. */
export function recipeClosePromotedLeadDetail(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const top = coreStack[coreStack.length - 1]
  if (top?.type !== 'leads.detail' || !top.returnToLeadsList) return null
  const withoutDetail = coreStack.slice(0, -1)
  const withList = withoutDetail.some((f) => f.type === 'leads')
    ? withoutDetail
    : [...withoutDetail, { type: 'leads' }]
  return appendTrailingTasks(withList, tasksFrames)
}

/** Open lead detail only — no Leads list panel (e.g. from Tasks). */
export function recipeOpenStandaloneLeadDetail(currentStack, leadId, opts = {}) {
  const detailStack = [{ type: 'leads.detail', leadId, dockBesideTasks: true }]
  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    return appendTrailingTasks(detailStack, tasksFrames)
  }
  return detailStack
}

/** Open lead detail as primary panel; keeps Schedule in stack for back. */
export function recipeOpenLeadDetailFromSchedule(currentStack, leadId, opts = {}) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const withoutLeadFrames = coreStack.filter(
    (f) => f.type !== 'schedule.lead' && f.type !== 'leads.detail',
  )
  const hasSchedule = withoutLeadFrames.some((f) => frameRoot(f.type) === 'schedule')
  const stackBase = hasSchedule ? withoutLeadFrames : [...withoutLeadFrames, { type: 'schedule' }]
  const detail = { type: 'leads.detail', leadId, dockBesideTasks: true }
  return appendTrailingTasks([...stackBase, detail], opts.keepTasks ? tasksFrames : [])
}

/** Open deal detail only — no Deals list panel (e.g. from Tasks). */
export function recipeOpenStandaloneDealDetail(currentStack, dealId, pipelineId, opts = {}) {
  const detailStack = [{ type: 'deals.detail', dealId, pipelineId, dockBesideTasks: true }]
  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    return appendTrailingTasks(detailStack, tasksFrames)
  }
  return detailStack
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

/** Open quote detail while keeping the Quotes list frame when it was already open. */
export function recipePushQuotesDetail(currentStack, quoteId) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const hadQuotesList = coreStack.some((f) => f.type === 'quotes')
  const withoutDetail = coreStack.filter((f) => f.type !== 'quotes.detail')
  const withList = hadQuotesList ? withoutDetail : [...withoutDetail, { type: 'quotes' }]
  return appendTrailingTasks([...withList, { type: 'quotes.detail', quoteId }], tasksFrames)
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

/** Open schedule at a date — swap into docked primary when keeping Tasks. */
export function recipeOpenScheduleAtDate(currentStack, initialDate, opts = {}) {
  const frame = { type: 'schedule', initialDate: initialDate ?? undefined }
  if (opts.keepTasks && stackHasTasks(currentStack)) {
    return recipeSwapPrimaryKeepTasks(currentStack, frame)
  }
  const withoutSchedule = currentStack.filter((f) => frameRoot(f.type) !== 'schedule')
  return [...withoutSchedule, frame]
}

/** Open deal detail as the primary panel; keeps Deals list mounted underneath for Back. */
export function recipePushDealsDetail(currentStack, dealId, pipelineId, opts = {}) {
  const build = (stack) => {
    const fromActivity = stack[0]?.type === 'activity'
    const hadDealsList = stack.some((f) => f.type === 'deals')
    const filtered = stack.filter(
      (f) =>
        f.type !== 'deals.closed' &&
        f.type !== 'deals.lead' &&
        f.type !== 'deals.detail' &&
        f.type !== 'deals',
    )
    const keepList = hadDealsList && !fromActivity
    return [
      ...filtered,
      ...(keepList ? [{ type: 'deals' }] : []),
      {
        type: 'deals.detail',
        dealId,
        pipelineId,
        ...(keepList ? { returnToDealsList: true } : {}),
      },
    ]
  }

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/** Back from promoted deal detail → Deals list when opened from it. */
export function recipeClosePromotedDealDetail(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const top = coreStack[coreStack.length - 1]
  if (top?.type !== 'deals.detail' || !top.returnToDealsList) return null
  const withoutDetail = coreStack.slice(0, -1)
  const withList = withoutDetail.some((f) => f.type === 'deals')
    ? withoutDetail
    : [...withoutDetail, { type: 'deals' }]
  return appendTrailingTasks(withList, tasksFrames)
}

/** Push closed deal view as primary panel — replaces competing deal/lead overlays. */
export function recipePushDealsClosed(currentStack, closedRecordId) {
  const fromActivity = currentStack[0]?.type === 'activity'
  const hadDealsList = currentStack.some((f) => f.type === 'deals')
  const filtered = currentStack.filter(
    (f) =>
      f.type !== 'deals.detail' &&
      f.type !== 'deals.lead' &&
      f.type !== 'deals.closed' &&
      f.type !== 'deals',
  )
  const keepList = hadDealsList && !fromActivity
  return [
    ...filtered,
    ...(keepList ? [{ type: 'deals' }] : []),
    {
      type: 'deals.closed',
      closedRecordId,
      ...(keepList ? { returnToDealsList: true } : {}),
    },
  ]
}

/** Back from promoted closed deal → Deals list when opened from it. */
export function recipeClosePromotedClosedDeal(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const top = coreStack[coreStack.length - 1]
  if (top?.type !== 'deals.closed' || !top.returnToDealsList) return null
  const withoutClosed = coreStack.slice(0, -1)
  const withList = withoutClosed.some((f) => f.type === 'deals')
    ? withoutClosed
    : [...withoutClosed, { type: 'deals' }]
  return appendTrailingTasks(withList, tasksFrames)
}

/**
 * Open lead detail over deal detail — keeps deal in stack for back navigation.
 * Inserts before trailing Tasks so the dock layout stays on the right rail.
 */
export function recipePushDealsLead(currentStack, leadId, opts = {}) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const leadsDetail = coreStack.find((f) => f.type === 'leads.detail')
  if (leadsDetail?.leadId === leadId) {
    const withoutDealLayers = coreStack.filter(
      (f) => f.type !== 'deals.detail' && f.type !== 'deals.lead',
    )
    if (withoutDealLayers.length !== coreStack.length) {
      if (opts.keepTasks && tasksFrames.length) {
        return appendTrailingTasks(withoutDealLayers, tasksFrames)
      }
      return withoutDealLayers
    }
  }
  const withoutLead = coreStack.filter((f) => f.type !== 'deals.lead')
  const withLead = [...withoutLead, { type: 'deals.lead', leadId }]
  if (opts.keepTasks && tasksFrames.length) {
    return appendTrailingTasks(withLead, tasksFrames)
  }
  return withLead
}

/**
 * Open deal detail from lead context — no Deals list or Pipes panel.
 * Keeps lead detail (and optional leads list) in the stack for back navigation.
 * When opened from Deals → deal → lead overlay, preserves deals.lead (and deals list).
 */
export function recipeOpenDealFromLeadDetail(currentStack, dealId, pipelineId, opts = {}) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const hasDealsLead = coreStack.some((f) => f.type === 'deals.lead')

  if (hasDealsLead) {
    const withoutDealDetail = coreStack.filter(
      (f) => f.type !== 'deals.detail' && f.type !== 'deals.lead',
    )
    const withDeal = [
      ...withoutDealDetail,
      { type: 'deals.detail', dealId, pipelineId, dockBesideTasks: true },
    ]
    if (opts.keepTasks && tasksFrames.length) {
      return appendTrailingTasks(withDeal, tasksFrames)
    }
    return withDeal
  }

  const stripDealAndPipeFrames = (f) =>
    f.type !== 'deals.detail' &&
    f.type !== 'deals.lead' &&
    f.type !== 'deals.closed' &&
    f.type !== 'deals' &&
    f.type !== 'pipes' &&
    f.type !== 'pipes.deal'

  const build = (stack) => [
    ...stack.filter(stripDealAndPipeFrames),
    { type: 'deals.detail', dealId, pipelineId, dockBesideTasks: true },
  ]

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/** Legacy: Leads → open deal in pipes */
export function recipeOpenDealInPipes(currentStack, pipelineId, dealId) {
  const prefix = activityPrefix(currentStack)
  return recipePushPipesDeal([...prefix, { type: 'pipes', pipelineId }], dealId)
}

/** Legacy: handleOpenTaskInDealPipeline */
export function recipeOpenTaskInPipes(currentStack, pipelineId, dealId) {
  return recipeOpenDealInPipes(currentStack, pipelineId, dealId)
}

/** Open deal detail as primary panel; Pipes kanban stays in stack for back navigation. */
export function recipePushPipesDeal(currentStack, dealId, opts = {}) {
  const build = (stack) => {
    const pipesFrame = stack.find((f) => f.type === 'pipes')
    const pipelineId = pipesFrame?.pipelineId
    const withoutDealFrames = stack.filter(
      (f) =>
        f.type !== 'pipes.deal' &&
        f.type !== 'deals.detail' &&
        f.type !== 'deals.lead',
    )
    return [
      ...withoutDealFrames,
      {
        type: 'deals.detail',
        dealId,
        pipelineId,
        returnToPipesList: true,
      },
    ]
  }

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const withoutTasks = currentStack.filter((f) => frameRoot(f.type) !== 'tasks')
    return appendTrailingTasks(build(withoutTasks), tasksFrames)
  }
  return build(currentStack)
}

/** Back from deal detail opened from Pipes → kanban (pipes frame remains). */
export function recipeClosePromotedPipesDealDetail(currentStack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const top = coreStack[coreStack.length - 1]
  if (top?.type !== 'deals.detail' || !top.returnToPipesList) return null
  return appendTrailingTasks(coreStack.slice(0, -1), tasksFrames)
}

/** Legacy: handleActivityNavigate — prefix activity, optionally keep docked Tasks */
export function recipeNavigateFromActivity(currentStack, destinationFrames, opts = {}) {
  const tasksFrames = (currentStack || []).filter((f) => frameRoot(f.type) === 'tasks')
  const base = [{ type: 'activity' }, ...destinationFrames]
  if (opts.keepTasks && tasksFrames.length) {
    const withoutTasks = base.filter((f) => frameRoot(f.type) !== 'tasks')
    return [...withoutTasks, ...tasksFrames]
  }
  return base
}

/** Legacy: returnFromActivityDestination — keep docked Tasks */
export function recipeReturnToActivity(currentStack = []) {
  const tasksFrames = (currentStack || []).filter((f) => frameRoot(f.type) === 'tasks')
  return [{ type: 'activity' }, ...tasksFrames]
}


export function recipeViewListContents(currentStack, listId, opts = {}) {
  const listsFrame = { type: 'lists' }
  const parcelFrame = { type: 'lists.parcels', listId }

  if (opts.keepTasks && stackHasTasks(currentStack)) {
    const tasksFrames = currentStack.filter((f) => frameRoot(f.type) === 'tasks')
    const rest = currentStack.filter((f) => {
      const root = frameRoot(f.type)
      if (root === 'tasks') return false
      if (TASKS_DOCKABLE_ROOTS.has(root)) return false
      return true
    })
    return [...rest, listsFrame, parcelFrame, ...tasksFrames]
  }

  const base = recipeClosePrimaryExcept(currentStack, { list: true }, [])
  const hasLists = base.some((f) => f.type === 'lists')
  const stack = hasLists ? base : [...base, listsFrame]
  return [...stack.filter((f) => f.type !== 'lists.parcels'), parcelFrame]
}

export function recipeOpenSkipTraced(currentStack) {
  return recipeClosePrimaryExcept(currentStack, { skipTraced: true }, [{ type: 'skipTraced' }])
}

export function recipeOpenOutreach(currentStack, initialTab = 'email', opts = {}) {
  return recipeOpenRootPanel(currentStack, 'outreach', { type: 'outreach', initialTab }, opts)
}

export function recipeOpenEmailComposer(currentStack, payload) {
  return [...currentStack.filter((f) => f.type !== 'emailComposer'), { type: 'emailComposer', payload }]
}

