import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import {
  createInitialState,
  navigationReducer,
  resetToMapFull,
} from './navigationReducer.js'
import { NAV_ACTIONS } from './types.js'
import { selectPanelProps, selectTopFrame } from './selectors.js'
import { feedDataToFrames } from './feedNavigation.js'
import {
  recipeClosePrimaryExcept,
  recipeNavigateFromActivity,
  recipeOpenDealInPipes,
  recipePushDealsClosed,
  recipePushDealsDetail,
  recipeOpenLeadDetails,
  recipeOpenLists,
  recipeOpenOutreach,
  recipeOpenPaths,
  recipeOpenDeals,
  recipeOpenForms,
  recipeOpenPipes,
  recipeOpenQuoteEditorFromDeal,
  recipeOpenQuoteDetailFromDeal,
  recipeOpenQuotes,
  recipeOpenReports,
  recipeOpenSchedule,
  recipeOpenScheduleAtDate,
  recipeOpenSettings,
  recipeOpenSkipTraced,
  recipeOpenTaskInPipes,
  recipeOpenTasks,
  recipeOpenTeams,
  recipeOpenLeads,
  recipeReturnToActivity,
  recipeViewListContents,
  recipeOpenBulkEmailPreview,
  recipeOpenEmailComposer,
} from './recipes.js'

const NavigationContext = createContext(null)

export function NavigationProvider({ children }) {
  const [state, dispatch] = useReducer(navigationReducer, undefined, createInitialState)

  const panelProps = useMemo(() => selectPanelProps(state), [state])
  const topFrame = useMemo(() => selectTopFrame(state), [state])

  const push = useCallback((frame) => {
    dispatch({ type: NAV_ACTIONS.PUSH, payload: frame })
  }, [])

  const replaceStack = useCallback((frames) => {
    dispatch({ type: NAV_ACTIONS.REPLACE_STACK, payload: frames })
  }, [])

  const pop = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.POP })
  }, [])

  /** Pop only when the top frame matches — avoids duplicate pops from Radix onOpenChange after back. */
  const popIfTop = useCallback((frameType) => {
    if (state.navStack[state.navStack.length - 1]?.type === frameType) {
      dispatch({ type: NAV_ACTIONS.POP })
    }
  }, [state.navStack])

  const resetToMap = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.REPLACE_STACK, payload: [] })
    dispatch({ type: NAV_ACTIONS.CLEAR_OVERLAYS })
  }, [])

  const resetToMapFullState = useCallback(() => {
    const next = resetToMapFull(state)
    dispatch({ type: NAV_ACTIONS.REPLACE_STACK, payload: next.navStack })
    dispatch({ type: NAV_ACTIONS.CLEAR_OVERLAYS })
    dispatch({ type: NAV_ACTIONS.REPLACE_MODALS, payload: [] })
    dispatch({ type: NAV_ACTIONS.SET_META, payload: next.meta })
  }, [state])

  const setShowMenu = useCallback((showMenu) => {
    dispatch({ type: NAV_ACTIONS.SET_META, payload: { showMenu } })
  }, [])

  const openFromRecipe = useCallback((frames) => {
    replaceStack(frames)
  }, [replaceStack])

  const openLeads = useCallback(() => {
    replaceStack(recipeOpenLeads(state.navStack))
  }, [state.navStack, replaceStack])

  const openDeals = useCallback(() => {
    replaceStack(recipeOpenDeals(state.navStack))
  }, [state.navStack, replaceStack])

  const openPipes = useCallback((pipelineId) => {
    replaceStack(recipeOpenPipes(state.navStack, pipelineId))
  }, [state.navStack, replaceStack])

  const openTasks = useCallback(() => {
    replaceStack(recipeOpenTasks(state.navStack))
  }, [state.navStack, replaceStack])

  const openSchedule = useCallback(() => {
    replaceStack(recipeOpenSchedule(state.navStack))
  }, [state.navStack, replaceStack])

  const openLists = useCallback(() => {
    replaceStack(recipeOpenLists(state.navStack))
  }, [state.navStack, replaceStack])

  const openPaths = useCallback(() => {
    replaceStack(recipeOpenPaths(state.navStack))
  }, [state.navStack, replaceStack])

  const openForms = useCallback(() => {
    replaceStack(recipeOpenForms(state.navStack))
  }, [state.navStack, replaceStack])

  const openQuotes = useCallback(() => {
    replaceStack(recipeOpenQuotes(state.navStack))
  }, [state.navStack, replaceStack])

  const openReports = useCallback(() => {
    replaceStack(recipeOpenReports(state.navStack))
  }, [state.navStack, replaceStack])

  const openTeams = useCallback(() => {
    replaceStack(recipeOpenTeams(state.navStack))
  }, [state.navStack, replaceStack])

  const openSettings = useCallback(() => {
    replaceStack(recipeOpenSettings(state.navStack))
  }, [state.navStack, replaceStack])

  const openActivity = useCallback(() => {
    replaceStack([{ type: 'activity' }])
  }, [replaceStack])

  const openLeadDetails = useCallback((leadId) => {
    replaceStack(recipeOpenLeadDetails(state.navStack, leadId))
  }, [state.navStack, replaceStack])

  const openDealInPipes = useCallback((pipelineId, dealId) => {
    replaceStack(recipeOpenDealInPipes(state.navStack, pipelineId, dealId))
  }, [state.navStack, replaceStack])

  const openScheduleAtDate = useCallback((ts) => {
    replaceStack(recipeOpenScheduleAtDate(state.navStack, ts))
  }, [state.navStack, replaceStack])

  const openQuoteEditorFromDeal = useCallback((prefill) => {
    replaceStack(recipeOpenQuoteEditorFromDeal(state.navStack, prefill))
  }, [state.navStack, replaceStack])

  const openQuoteDetailFromDeal = useCallback((quoteId, quote = null) => {
    replaceStack(recipeOpenQuoteDetailFromDeal(state.navStack, quoteId, quote))
  }, [state.navStack, replaceStack])

  const viewListContents = useCallback((listId) => {
    replaceStack(recipeViewListContents(state.navStack, listId))
  }, [state.navStack, replaceStack])

  const openSkipTraced = useCallback(() => {
    replaceStack(recipeOpenSkipTraced(state.navStack))
  }, [state.navStack, replaceStack])

  const openOutreach = useCallback((initialTab = 'email') => {
    replaceStack(recipeOpenOutreach(state.navStack, initialTab))
  }, [state.navStack, replaceStack])

  const navigateFromFeed = useCallback((data, ctx) => {
    const result = feedDataToFrames(data, ctx)
    if (!result.ok) return result
    replaceStack(result.frames)
    return result
  }, [replaceStack])

  const navigateFromActivity = useCallback((data, ctx) => {
    const result = feedDataToFrames(data, ctx)
    if (!result.ok) return result
    replaceStack(recipeNavigateFromActivity([], result.frames))
    return result
  }, [replaceStack])

  const returnToActivity = useCallback(() => {
    replaceStack(recipeReturnToActivity())
  }, [replaceStack])

  const closeActivity = useCallback(() => {
    if (state.navStack[0]?.type === 'activity' && state.navStack.length === 1) {
      replaceStack([])
    } else {
      pop()
    }
  }, [state.navStack, replaceStack, pop])

  const setActivityOpen = useCallback((open) => {
    if (open) {
      replaceStack([{ type: 'activity' }])
    } else if (state.navStack[state.navStack.length - 1]?.type === 'activity') {
      replaceStack([])
    }
  }, [state.navStack, replaceStack])

  // Panel overlay navigation helpers
  const pushLeadsDetail = useCallback((leadId) => push({ type: 'leads.detail', leadId }), [push])
  const popLeadsDetail = useCallback(() => popIfTop('leads.detail'), [popIfTop])

  const pushDealsDetail = useCallback((dealId, pipelineId) => {
    replaceStack(recipePushDealsDetail(state.navStack, dealId, pipelineId))
  }, [state.navStack, replaceStack])

  const pushDealsClosed = useCallback((closedRecordId) => {
    replaceStack(recipePushDealsClosed(state.navStack, closedRecordId))
  }, [state.navStack, replaceStack])

  const pushDealsLead = useCallback((leadId) => {
    push({ type: 'deals.lead', leadId })
  }, [push])

  const pushPipesDeal = useCallback((dealId) => {
    push({ type: 'pipes.deal', dealId })
  }, [push])

  const pushPipesLead = useCallback((leadId) => {
    push({ type: 'pipes.lead', leadId })
  }, [push])

  const pushScheduleLead = useCallback((leadId) => {
    push({ type: 'schedule.lead', leadId })
  }, [push])

  const pushFormsEdit = useCallback((templateId) => {
    push({ type: 'forms.edit', templateId })
  }, [push])

  const pushFormsFill = useCallback((templateId) => {
    push({ type: 'forms.fill', templateId })
  }, [push])

  const popFormsSubView = useCallback(() => pop(), [pop])

  const pushQuotesEditor = useCallback((editorFrame) => {
    push({ type: 'quotes.editor', ...editorFrame })
  }, [push])

  const pushQuotesDetail = useCallback((quoteId) => {
    push({ type: 'quotes.detail', quoteId })
  }, [push])

  const pushReportsEditor = useCallback((editorFrame) => {
    push({ type: 'reports.editor', ...editorFrame })
  }, [push])

  const pushReportsDetail = useCallback((reportId) => {
    push({ type: 'reports.detail', reportId })
  }, [push])

  const pushTeamsDetail = useCallback((teamId) => {
    push({ type: 'teams.detail', teamId })
  }, [push])

  const openTaskInPipes = useCallback((pipelineId, dealId) => {
    replaceStack(recipeOpenTaskInPipes(state.navStack, pipelineId, dealId))
  }, [state.navStack, replaceStack])

  // Map overlay
  const showParcelPopup = useCallback((overlay) => {
    dispatch({ type: NAV_ACTIONS.REPLACE_OVERLAY, payload: overlay })
  }, [])

  const pushMapOverlay = useCallback((overlay) => {
    dispatch({ type: NAV_ACTIONS.PUSH_OVERLAY, payload: overlay })
  }, [])

  const popMapOverlay = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.POP_OVERLAY })
  }, [])

  const clearMapOverlays = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.CLEAR_OVERLAYS })
  }, [])

  const openParcelDetails = useCallback((overlay) => {
    dispatch({ type: NAV_ACTIONS.REPLACE_OVERLAY, payload: overlay })
  }, [])

  const openHailOverlay = useCallback((overlay) => {
    dispatch({ type: NAV_ACTIONS.PUSH_OVERLAY, payload: overlay })
  }, [])

  const dismissParcelAndHailPanels = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.DISMISS_PARCEL_HAIL_PANELS })
  }, [])

  const showPhoneOverlay = useCallback((overlay) => {
    dispatch({ type: NAV_ACTIONS.REPLACE_OVERLAY, payload: overlay })
  }, [])

  // Modals
  const pushModal = useCallback((modal) => {
    dispatch({ type: NAV_ACTIONS.PUSH_MODAL, payload: modal })
  }, [])

  const popModal = useCallback(() => {
    dispatch({ type: NAV_ACTIONS.POP_MODAL })
  }, [])

  const replaceModals = useCallback((modals) => {
    dispatch({ type: NAV_ACTIONS.REPLACE_MODALS, payload: modals })
  }, [])

  const openLogin = useCallback(() => replaceModals([{ type: 'login' }]), [replaceModals])
  const openSignUp = useCallback(() => replaceModals([{ type: 'signup' }]), [replaceModals])
  const openForgotPassword = useCallback(() => replaceModals([{ type: 'forgotPassword' }]), [replaceModals])
  const closeAuthModals = useCallback(() => replaceModals([]), [replaceModals])

  const patchTopOverlay = useCallback((patch) => {
    dispatch({ type: NAV_ACTIONS.PATCH_TOP_OVERLAY, payload: patch })
  }, [])

  const consumeScheduleInitialDate = useCallback(() => {
    dispatch({
      type: NAV_ACTIONS.PATCH_NAV_FRAME,
      payload: { frameType: 'schedule', patch: { initialDate: undefined } },
    })
  }, [])

  const value = useMemo(() => ({
    state,
    panelProps,
    topFrame,
    push,
    pop,
    popIfTop,
    replaceStack,
    resetToMap,
    resetToMapFullState,
    setShowMenu,
    openFromRecipe,
    openLeads,
    openDeals,
    openPipes,
    openTasks,
    openSchedule,
    openLists,
    openPaths,
    openForms,
    openQuotes,
    openReports,
    openTeams,
    openSettings,
    openActivity,
    openLeadDetails,
    openDealInPipes,
    openScheduleAtDate,
    openQuoteEditorFromDeal,
    openQuoteDetailFromDeal,
    viewListContents,
    openSkipTraced,
    openOutreach,
    navigateFromFeed,
    navigateFromActivity,
    returnToActivity,
    closeActivity,
    setActivityOpen,
    pushLeadsDetail,
    popLeadsDetail,
    pushDealsDetail,
    pushDealsClosed,
    pushDealsLead,
    pushPipesDeal,
    pushPipesLead,
    pushScheduleLead,
    pushFormsEdit,
    pushFormsFill,
    popFormsSubView,
    pushQuotesEditor,
    pushQuotesDetail,
    pushReportsEditor,
    pushReportsDetail,
    pushTeamsDetail,
    openTaskInPipes,
    showParcelPopup,
    pushMapOverlay,
    popMapOverlay,
    clearMapOverlays,
    openParcelDetails,
    openHailOverlay,
    dismissParcelAndHailPanels,
    showPhoneOverlay,
    pushModal,
    popModal,
    replaceModals,
    openLogin,
    openSignUp,
    openForgotPassword,
    closeAuthModals,
    patchTopOverlay,
    consumeScheduleInitialDate,
    recipeClosePrimaryExcept: (keep, append) => recipeClosePrimaryExcept(state.navStack, keep, append),
  }), [
    state,
    panelProps,
    topFrame,
    push,
    pop,
    popIfTop,
    replaceStack,
    resetToMap,
    resetToMapFullState,
    setShowMenu,
    openFromRecipe,
    openLeads,
    openDeals,
    openPipes,
    openTasks,
    openSchedule,
    openLists,
    openPaths,
    openForms,
    openQuotes,
    openReports,
    openTeams,
    openSettings,
    openActivity,
    openLeadDetails,
    openDealInPipes,
    openScheduleAtDate,
    openQuoteEditorFromDeal,
    openQuoteDetailFromDeal,
    viewListContents,
    openSkipTraced,
    openOutreach,
    navigateFromFeed,
    navigateFromActivity,
    returnToActivity,
    closeActivity,
    setActivityOpen,
    pushLeadsDetail,
    popLeadsDetail,
    pushDealsDetail,
    pushDealsClosed,
    pushDealsLead,
    pushPipesDeal,
    pushPipesLead,
    pushScheduleLead,
    pushFormsEdit,
    pushFormsFill,
    popFormsSubView,
    pushQuotesEditor,
    pushQuotesDetail,
    pushReportsEditor,
    pushReportsDetail,
    pushTeamsDetail,
    openTaskInPipes,
    showParcelPopup,
    pushMapOverlay,
    popMapOverlay,
    clearMapOverlays,
    openParcelDetails,
    openHailOverlay,
    dismissParcelAndHailPanels,
    showPhoneOverlay,
    pushModal,
    popModal,
    replaceModals,
    openLogin,
    openSignUp,
    openForgotPassword,
    closeAuthModals,
    patchTopOverlay,
    consumeScheduleInitialDate,
  ])

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[nav]', state.navStack.map((f) => f.type), state.mapOverlayStack.map((o) => o.type))
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}

/** Safe hook for components that may render outside provider during tests. */
export function useNavigationOptional() {
  return useContext(NavigationContext)
}

export function usePanelProps() {
  const { panelProps } = useNavigation()
  return panelProps
}
