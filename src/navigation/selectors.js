import { frameRoot, STACKABLE_SCHEDULE_OPENERS } from './types.js'
import { findDockablePrimaryRoot, getStandaloneDetailBesideTasks, splitTrailingTasks, stackHasTasks } from './taskDock.js'

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectTopFrame(state) {
  const stack = state.navStack
  return stack.length ? stack[stack.length - 1] : null
}

/** Top frame for panel z-index — ignores trailing Tasks dock frame. */
export function selectTopCoreFrame(state) {
  const { coreStack } = splitTrailingTasks(state.navStack)
  return coreStack.length ? coreStack[coreStack.length - 1] : null
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectFromActivity(state) {
  return state.navStack.length > 0 && state.navStack[0].type === 'activity'
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 * @param {string} rootType
 */
export function hasFrameRoot(state, rootType) {
  return state.navStack.some((f) => frameRoot(f.type) === rootType)
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectIsStackedUnderSchedule(state) {
  const stack = state.navStack
  const top = stack[stack.length - 1]
  if (!top || top.type !== 'schedule') return false
  if (stack.length < 2) return false
  const opener = stack[stack.length - 2]
  return STACKABLE_SCHEDULE_OPENERS.has(frameRoot(opener.type))
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectHasScheduleOpener(state) {
  const top = selectTopFrame(state)
  return top?.type === 'schedule' && state.navStack.length > 1
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectAnyPanelOpen(state) {
  return (
    state.navStack.length > 0 ||
    state.mapOverlayStack.some((o) => o.type === 'parcelDetails' || o.type === 'hail') ||
    state.navStack.some((f) => f.type === 'outreach' || f.type === 'emailComposer')
  )
}

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectTopOverlay(state) {
  const stack = state.mapOverlayStack
  return stack.length ? stack[stack.length - 1] : null
}

function findFrame(state, type) {
  for (let i = state.navStack.length - 1; i >= 0; i--) {
    if (state.navStack[i].type === type) return state.navStack[i]
  }
  return null
}

function hasExactFrame(state, type) {
  return state.navStack.some((f) => f.type === type)
}

function findFrameRoot(state, root) {
  for (let i = state.navStack.length - 1; i >= 0; i--) {
    if (frameRoot(state.navStack[i].type) === root) return state.navStack[i]
  }
  return null
}

/**
 * Desktop: Tasks docked to the right of an open primary list panel.
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectTasksDockLayout(state) {
  const stack = state.navStack
  if (!stackHasTasks(stack)) {
    return { tasksDocked: false, primaryRoot: null, tasksSoloDetail: false, soloDetailRoot: null }
  }

  const soloDetailRoot = getStandaloneDetailBesideTasks(stack)
  const primaryRoot = findDockablePrimaryRoot(stack)

  // Standalone detail beside solo Tasks (e.g. task → lead). When a dockable primary
  // (activity, leads list, etc.) is still in the stack, keep the docked pair intact.
  if (soloDetailRoot && !primaryRoot) {
    return {
      tasksDocked: false,
      primaryRoot: null,
      tasksSoloDetail: true,
      soloDetailRoot,
    }
  }

  return {
    tasksDocked: !!primaryRoot,
    primaryRoot,
    tasksSoloDetail: false,
    soloDetailRoot: null,
  }
}

/** Activity is interactive when it is top, or the docked primary beside Tasks. */
export function isActivityFeedFocused(state) {
  const stack = state.navStack
  const activityFrame = stack.find((f) => f.type === 'activity')
  if (!activityFrame) return false
  const top = selectTopFrame(state)
  if (top?.type === 'activity') return true
  if (!stackHasTasks(stack)) return false
  const primaryRoot = findDockablePrimaryRoot(stack)
  return primaryRoot === 'activity' && frameRoot(top?.type) === 'tasks'
}

/**
 * Derive all panel props from navigation state.
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectPanelProps(state) {
  const stack = state.navStack
  const top = selectTopFrame(state)
  const topCore = selectTopCoreFrame(state)
  const overlay = selectTopOverlay(state)

  const activityFrame = stack.find((f) => f.type === 'activity')
  const leadsDetail = findFrame(state, 'leads.detail')
  const dealsDetail = findFrame(state, 'deals.detail')
  const dealsClosed = findFrame(state, 'deals.closed')
  const dealsLead = findFrame(state, 'deals.lead')
  const pipesFrame = findFrameRoot(state, 'pipes')
  const pipesDeal = findFrame(state, 'pipes.deal')
  const pipesLead = findFrame(state, 'pipes.lead')
  const scheduleFrame = findFrame(state, 'schedule')
  const listsParcels = findFrame(state, 'lists.parcels')
  const formsEdit = findFrame(state, 'forms.edit')
  const formsFill = findFrame(state, 'forms.fill')
  const quotesEditor = findFrame(state, 'quotes.editor')
  const quotesDetail = findFrame(state, 'quotes.detail')
  const reportsEditor = findFrame(state, 'reports.editor')
  const reportsDetail = findFrame(state, 'reports.detail')
  const teamsDetail = findFrame(state, 'teams.detail')
  const outreachFrame = findFrame(state, 'outreach')
  const emailComposerFrame = findFrame(state, 'emailComposer')
  const popupOverlay = state.mapOverlayStack.find((o) => o.type === 'popup')
  const detailsOverlay = state.mapOverlayStack.find((o) => o.type === 'parcelDetails')
  const hailOverlay = state.mapOverlayStack.find((o) => o.type === 'hail')
  const phoneOverlay = state.mapOverlayStack.find((o) => o.type === 'phone')
  const emailOverlay = state.mapOverlayStack.find((o) => o.type === 'email')
  const topOverlay = selectTopOverlay(state)

  return {
    /** Activity dialog stays mounted while activity remains in the stack (avoids reopen flicker on back). */
    isActivityPanelOpen: !!activityFrame,
    isActivityPanelFocused: isActivityFeedFocused(state),
    /** Visual stack order: only the top nav frame gets dialog topLayer (z-index). */
    isActivityPanelTopLayer: top?.type === 'activity',
    isTasksPanelTopLayer: top?.type === 'tasks',
    isSettingsPanelTopLayer: topCore?.type === 'settings',
    isLeadsDetailTopLayer: topCore?.type === 'leads.detail',
    isTeamsDetailTopLayer: topCore?.type === 'teams.detail',
    isListPanelOpen: hasFrameRoot(state, 'lists'),
    isParcelListPanelOpen: !!listsParcels,
    viewingListId: listsParcels?.listId ?? null,
    isLeadsPanelOpen: hasExactFrame(state, 'leads'),
    leadsDetailLeadId: leadsDetail?.leadId ?? null,
    isLeadsDetailStandalone: !!leadsDetail && !hasExactFrame(state, 'leads'),
    isDealsPanelOpen: hasExactFrame(state, 'deals'),
    isDealsDetailStandalone: !!dealsDetail && !hasExactFrame(state, 'deals'),
    dealsDetailDealId: dealsDetail?.dealId ?? null,
    dealsDetailPipelineId: dealsDetail?.pipelineId ?? null,
    dealsDetailReturnToPipes: !!dealsDetail?.returnToPipesList,
    dealsClosedRecordId: dealsClosed?.closedRecordId ?? null,
    dealsLeadOverlayId: dealsLead?.leadId ?? null,
    isDealPipelineOpen: hasFrameRoot(state, 'pipes'),
    pipesPipelineId: pipesFrame?.pipelineId ?? null,
    pipesDealId: pipesDeal?.dealId ?? null,
    pipesPromotedDealId: dealsDetail?.returnToPipesList ? dealsDetail.dealId : null,
    pipesLeadOverlayId: pipesLead?.leadId ?? null,
    isTasksPanelOpen: hasFrameRoot(state, 'tasks'),
    tasksDockLayout: selectTasksDockLayout(state),
    isSchedulePanelOpen: hasFrameRoot(state, 'schedule'),
    scheduleInitialDate: scheduleFrame?.initialDate ?? null,
    scheduleStacked: selectIsStackedUnderSchedule(state),
    hasScheduleOpener: selectHasScheduleOpener(state),
    isPathsPanelOpen: hasFrameRoot(state, 'paths'),
    isFormsPanelOpen: hasFrameRoot(state, 'forms'),
    formsView: formsFill ? 'fill' : formsEdit ? 'edit' : 'list',
    formsTemplateId: formsFill?.templateId ?? formsEdit?.templateId ?? null,
    isQuotesPanelOpen: hasFrameRoot(state, 'quotes'),
    isQuotesListOpen: hasExactFrame(state, 'quotes'),
    quotesEditorFrame: quotesEditor ?? null,
    quotesDetailQuoteId: quotesDetail?.quoteId ?? null,
    quotesDetailQuote: quotesDetail?.quote ?? null,
    quotesDetailReturnToDeal: !!quotesDetail?.returnToDeal,
    isReportsPanelOpen: hasFrameRoot(state, 'reports'),
    isReportsListOpen: hasExactFrame(state, 'reports'),
    isReportsDetailStandalone: !!(reportsDetail || reportsEditor) && !hasExactFrame(state, 'reports'),
    reportsEditorFrame: reportsEditor ?? null,
    reportsEditorReturnToLead: !!reportsEditor?.returnToLead,
    reportsDetailReportId: reportsDetail?.reportId ?? null,
    reportsDetailReport: reportsDetail?.report ?? null,
    reportsDetailReturnToLead: !!reportsDetail?.returnToLead,
    isTeamsPanelOpen: hasFrameRoot(state, 'teams'),
    teamsDetailTeamId: teamsDetail?.teamId ?? null,
    isSettingsPanelOpen: hasFrameRoot(state, 'settings'),
    isSkipTracedListPanelOpen: hasFrameRoot(state, 'skipTraced'),
    isOutreachPanelOpen: !!outreachFrame,
    outreachInitialTab: outreachFrame?.initialTab ?? 'email',
    isEmailComposerOpen: !!emailComposerFrame,
    /** True while parcel details remain on the overlay stack (including under hail). */
    isParcelDetailsOpen: !!detailsOverlay,
    parcelDetailsSource: detailsOverlay?.source ?? 'map',
    isHailDataOpen: topOverlay?.type === 'hail',
    hailDataParcel: hailOverlay?.parcelData ?? detailsOverlay?.parcelData ?? popupOverlay?.parcelData ?? null,
    phoneActionPanel: phoneOverlay ? {
      phone: phoneOverlay.phone,
      parcelData: phoneOverlay.parcelData,
      leadId: phoneOverlay.leadId ?? null,
      initialStep: phoneOverlay.initialStep ?? 1,
    } : null,
    emailActionPanel: emailOverlay ? {
      email: emailOverlay.email,
      parcelData: emailOverlay.parcelData,
      leadId: emailOverlay.leadId ?? null,
    } : null,
    popupData: popupOverlay?.popupData ?? null,
    clickedParcelId: detailsOverlay?.parcelId ?? popupOverlay?.parcelId ?? hailOverlay?.parcelId ?? null,
    clickedParcelData: detailsOverlay?.parcelData ?? popupOverlay?.parcelData ?? hailOverlay?.parcelData ?? null,
    fromActivity: selectFromActivity(state),
    showMenu: state.meta.showMenu ?? false,
    modalStack: state.modalStack,
    isLoginOpen: state.modalStack.some((m) => m.type === 'login'),
    isSignUpOpen: state.modalStack.some((m) => m.type === 'signup'),
    isForgotPasswordOpen: state.modalStack.some((m) => m.type === 'forgotPassword'),
    createLeadOpen: state.modalStack.some((m) => m.type === 'createLead'),
    createLeadPrefill: state.modalStack.find((m) => m.type === 'createLead')?.prefill ?? null,
    createDealOpen: state.modalStack.some((m) => m.type === 'createDeal'),
    createDealPrefill: state.modalStack.find((m) => m.type === 'createDeal')?.prefill ?? null,
    dealTemplatePickerOpen: state.modalStack.some((m) => m.type === 'dealTemplatePicker'),
    pendingCreateDealPrefill: state.modalStack.find((m) => m.type === 'dealTemplatePicker')?.prefill ?? null,
    dealTemplateEditorOpen: state.modalStack.some((m) => m.type === 'dealTemplateEditor'),
    editingDealTemplateId: state.modalStack.find((m) => m.type === 'dealTemplateEditor')?.templateId ?? null,
    dealTemplatesManagerOpen: state.modalStack.some((m) => m.type === 'dealTemplatesManager'),
    moveDealContext: state.modalStack.find((m) => m.type === 'moveDeal')?.context ?? null,
  }
}

/** Action bar highlight — highest-priority open primary panel. */
export function selectActionBarActiveId(state) {
  const p = selectPanelProps(state)
  if (p.isDealPipelineOpen) return 'pipes'
  if (p.isTasksPanelOpen) return 'tasks'
  if (p.isSchedulePanelOpen) return 'schedule'
  if (p.isLeadsPanelOpen) return 'leads'
  if (p.isDealsPanelOpen) return 'deals'
  if (p.isQuotesPanelOpen) return 'quotes'
  if (p.isFormsPanelOpen) return 'forms'
  if (p.isReportsPanelOpen) return 'reports'
  if (p.isListPanelOpen && !p.isParcelListPanelOpen) return 'lists'
  if (p.isActivityPanelOpen) return 'activity'
  if (p.isPathsPanelOpen) return 'paths'
  if (p.isOutreachPanelOpen) return 'outreach'
  if (p.isSettingsPanelOpen) return 'settings'
  return null
}
