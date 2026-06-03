import { frameRoot, STACKABLE_SCHEDULE_OPENERS } from './types.js'

/**
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectTopFrame(state) {
  const stack = state.navStack
  return stack.length ? stack[stack.length - 1] : null
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
    state.navStack.some((f) => f.type === 'outreach' || f.type === 'emailComposer' || f.type === 'bulkEmailPreview')
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

function findFrameRoot(state, root) {
  for (let i = state.navStack.length - 1; i >= 0; i--) {
    if (frameRoot(state.navStack[i].type) === root) return state.navStack[i]
  }
  return null
}

/**
 * Derive all panel props from navigation state.
 * @param {ReturnType<import('./navigationReducer.js').createInitialState>} state
 */
export function selectPanelProps(state) {
  const stack = state.navStack
  const top = selectTopFrame(state)
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
  const scheduleLead = findFrame(state, 'schedule.lead')
  const listsParcels = findFrame(state, 'lists.parcels')
  const formsEdit = findFrame(state, 'forms.edit')
  const formsFill = findFrame(state, 'forms.fill')
  const quotesEditor = findFrame(state, 'quotes.editor')
  const quotesDetail = findFrame(state, 'quotes.detail')
  const teamsDetail = findFrame(state, 'teams.detail')
  const outreachFrame = findFrame(state, 'outreach')
  const emailComposerFrame = findFrame(state, 'emailComposer')
  const bulkEmailFrame = findFrame(state, 'bulkEmailPreview')

  const popupOverlay = state.mapOverlayStack.find((o) => o.type === 'popup')
  const detailsOverlay = state.mapOverlayStack.find((o) => o.type === 'parcelDetails')
  const hailOverlay = state.mapOverlayStack.find((o) => o.type === 'hail')
  const phoneOverlay = state.mapOverlayStack.find((o) => o.type === 'phone')
  const topOverlay = selectTopOverlay(state)

  return {
    /** Activity dialog stays mounted while activity remains in the stack (avoids reopen flicker on back). */
    isActivityPanelOpen: !!activityFrame,
    isActivityPanelFocused: !!activityFrame && top?.type === 'activity',
    skipPanelExitAnimation: !!state.meta.skipPanelExitAnimation,
    isListPanelOpen: hasFrameRoot(state, 'lists'),
    isParcelListPanelOpen: !!listsParcels,
    viewingListId: listsParcels?.listId ?? null,
    isLeadsPanelOpen: hasFrameRoot(state, 'leads'),
    leadsDetailLeadId: leadsDetail?.leadId ?? null,
    isDealsPanelOpen: hasFrameRoot(state, 'deals'),
    dealsDetailDealId: dealsDetail?.dealId ?? null,
    dealsDetailPipelineId: dealsDetail?.pipelineId ?? null,
    dealsClosedRecordId: dealsClosed?.closedRecordId ?? null,
    dealsLeadOverlayId: dealsLead?.leadId ?? null,
    isDealPipelineOpen: hasFrameRoot(state, 'pipes'),
    pipesPipelineId: pipesFrame?.pipelineId ?? null,
    pipesDealId: pipesDeal?.dealId ?? null,
    pipesLeadOverlayId: pipesLead?.leadId ?? null,
    isTasksPanelOpen: hasFrameRoot(state, 'tasks'),
    isSchedulePanelOpen: hasFrameRoot(state, 'schedule'),
    scheduleInitialDate: scheduleFrame?.initialDate ?? null,
    scheduleLeadId: scheduleLead?.leadId ?? null,
    scheduleStacked: selectIsStackedUnderSchedule(state),
    hasScheduleOpener: selectHasScheduleOpener(state),
    isPathsPanelOpen: hasFrameRoot(state, 'paths'),
    isFormsPanelOpen: hasFrameRoot(state, 'forms'),
    formsView: formsFill ? 'fill' : formsEdit ? 'edit' : 'list',
    formsTemplateId: formsFill?.templateId ?? formsEdit?.templateId ?? null,
    isQuotesPanelOpen: hasFrameRoot(state, 'quotes'),
    quotesEditorFrame: quotesEditor ?? null,
    quotesDetailQuoteId: quotesDetail?.quoteId ?? null,
    isTeamsPanelOpen: hasFrameRoot(state, 'teams'),
    teamsDetailTeamId: teamsDetail?.teamId ?? null,
    isSettingsPanelOpen: hasFrameRoot(state, 'settings'),
    isSkipTracedListPanelOpen: hasFrameRoot(state, 'skipTraced'),
    isOutreachPanelOpen: !!outreachFrame,
    outreachInitialTab: outreachFrame?.initialTab ?? 'email',
    isEmailComposerOpen: !!emailComposerFrame,
    isBulkEmailPreviewOpen: !!bulkEmailFrame,
    bulkEmailListId: bulkEmailFrame?.listId ?? null,
    /** True while parcel details remain on the overlay stack (including under hail). */
    isParcelDetailsOpen: !!detailsOverlay,
    parcelDetailsSource: detailsOverlay?.source ?? 'map',
    isHailDataOpen: topOverlay?.type === 'hail',
    hailDataParcel: hailOverlay?.parcelData ?? detailsOverlay?.parcelData ?? popupOverlay?.parcelData ?? null,
    phoneActionPanel: phoneOverlay ? { phone: phoneOverlay.phone, parcelData: phoneOverlay.parcelData } : null,
    popupData: popupOverlay?.popupData ?? null,
    clickedParcelId: popupOverlay?.parcelId ?? detailsOverlay?.parcelId ?? hailOverlay?.parcelId ?? null,
    clickedParcelData: popupOverlay?.parcelData ?? detailsOverlay?.parcelData ?? hailOverlay?.parcelData ?? null,
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
