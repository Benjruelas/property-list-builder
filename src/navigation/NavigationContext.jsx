import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import {
  createInitialState,
  navigationReducer,
  resetToMapFull,
} from './navigationReducer.js'
import {
  consumeNavRestoreFlag,
  isPublicPreviewRoute,
  persistNavStack,
  readPersistedNavStack,
} from '../utils/clientPreview.js'
import { NAV_ACTIONS } from './types.js'
import { selectActionBarActiveId, selectPanelProps, selectTopFrame } from './selectors.js'
import { feedDataToFrames } from './feedNavigation.js'
import {
  recipeClosePrimaryExcept,
  recipeNavigateFromActivity,
  recipeOpenDealInPipes,
  recipePushDealsClosed,
  recipePushDealsDetail,
  recipePushDealsLead,
  recipeOpenLeadDetails,
  recipeOpenStandaloneLeadDetail,
  recipeOpenLeadDetailFromSchedule,
  recipeOpenStandaloneDealDetail,
  recipeOpenDealFromLeadDetail,
  recipeClosePromotedLeadDetail,
  recipeClosePromotedDealDetail,
  recipeClosePromotedPipesDealDetail,
  recipeClosePromotedClosedDeal,
  recipeOpenLists,
  recipeOpenOutreach,
  recipeOpenPaths,
  recipeOpenDeals,
  recipeOpenForms,
  recipeOpenPipes,
  recipeOpenQuoteEditorFromDeal,
  recipeOpenQuoteDetailFromDeal,
  recipePushQuotesDetail,
  recipeOpenQuotes,
  recipeOpenReports,
  recipeOpenSchedule,
  recipeOpenScheduleAtDate,
  recipeOpenSettings,
  recipeOpenSkipTraced,
  recipeOpenTaskInPipes,
  recipePushPipesDeal,
  recipeOpenTasks,
  recipeCloseTasks,
  recipeSwapPrimaryKeepTasks,
  recipeOpenLeads,
  recipeReturnToActivity,
  recipeViewListContents,
  recipeOpenBulkEmailPreview,
  recipeOpenEmailComposer,
} from './recipes.js'
import {
  findDockablePrimaryRoot,
  isDesktopTaskDockEnabled,
  popFrameIfTopOfCore,
  primeTasksPanelOpen,
  recipeClosePrimaryRoot,
  shouldKeepTasksWhenOpening,
  stackHasPrimaryRoot,
  stackHasTasks,
} from './taskDock.js'

const NavigationContext = createContext(null)

/**
 * Restore the navStack only after returning from a client preview (durable flag set
 * at preview open). Never restore on the public preview page, which shares this provider.
 */
function initNavState() {
  const base = createInitialState()
  if (isPublicPreviewRoute()) return base
  if (!consumeNavRestoreFlag()) return base
  const navStack = readPersistedNavStack()
  return navStack ? { ...base, navStack } : base
}

export function NavigationProvider({ children }) {
  const [state, dispatch] = useReducer(navigationReducer, undefined, initNavState)

  // Keep a sessionStorage snapshot of the nav stack so it survives the reload that
  // returnToAppFromClientPreview triggers. No-ops on public preview routes.
  useEffect(() => {
    persistNavStack(state.navStack)
  }, [state.navStack])

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

  /** Pop only when the frame matches stack top — ignores trailing Tasks dock frame. */
  const popIfTop = useCallback((frameType) => {
    const next = popFrameIfTopOfCore(state.navStack, frameType)
    if (next !== state.navStack) {
      dispatch({ type: NAV_ACTIONS.REPLACE_STACK, payload: next })
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

  const taskDockOpts = useCallback(() => ({
    keepTasks: shouldKeepTasksWhenOpening(state.navStack),
  }), [state.navStack])

  const openLeads = useCallback(() => {
    if (state.navStack.some((f) => f.type === 'leads')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'leads'))
      return
    }
    replaceStack(recipeOpenLeads(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openDeals = useCallback(() => {
    if (state.navStack.some((f) => f.type === 'deals')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'deals'))
      return
    }
    replaceStack(recipeOpenDeals(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openPipes = useCallback((pipelineId) => {
    if (stackHasPrimaryRoot(state.navStack, 'pipes')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'pipes'))
      return
    }
    replaceStack(recipeOpenPipes(state.navStack, pipelineId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openTasks = useCallback(() => {
    if (stackHasTasks(state.navStack)) {
      replaceStack(recipeCloseTasks(state.navStack))
      return
    }
    const keepPrimary = isDesktopTaskDockEnabled()
    const nextStack = recipeOpenTasks(state.navStack, { keepPrimary })
    const primaryRoot = keepPrimary ? findDockablePrimaryRoot(nextStack) : null
    primeTasksPanelOpen({ docked: !!primaryRoot, primaryRoot })
    replaceStack(nextStack)
  }, [state.navStack, replaceStack])

  const closeTasksPanel = useCallback(() => {
    replaceStack(recipeCloseTasks(state.navStack))
  }, [state.navStack, replaceStack])

  const openSchedule = useCallback(() => {
    if (stackHasPrimaryRoot(state.navStack, 'schedule')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'schedule'))
      return
    }
    if (shouldKeepTasksWhenOpening(state.navStack)) {
      replaceStack(recipeSwapPrimaryKeepTasks(state.navStack, { type: 'schedule' }))
      return
    }
    replaceStack(recipeOpenSchedule(state.navStack))
  }, [state.navStack, replaceStack])

  const openLists = useCallback(() => {
    if (state.navStack.some((f) => f.type === 'lists')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'list'))
      return
    }
    replaceStack(recipeOpenLists(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openPaths = useCallback(() => {
    if (stackHasPrimaryRoot(state.navStack, 'paths')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'paths'))
      return
    }
    replaceStack(recipeOpenPaths(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openForms = useCallback(() => {
    if (stackHasPrimaryRoot(state.navStack, 'forms')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'forms'))
      return
    }
    replaceStack(recipeOpenForms(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openQuotes = useCallback(() => {
    if (stackHasPrimaryRoot(state.navStack, 'quotes')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'quotes'))
      return
    }
    replaceStack(recipeOpenQuotes(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openReports = useCallback(() => {
    if (stackHasPrimaryRoot(state.navStack, 'reports')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'reports'))
      return
    }
    replaceStack(recipeOpenReports(state.navStack, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openSettings = useCallback(() => {
    if (state.navStack.some((f) => f.type === 'settings')) {
      replaceStack(state.navStack.filter((f) => f.type !== 'settings'))
      return
    }
    replaceStack(recipeOpenSettings(state.navStack))
  }, [state.navStack, replaceStack])

  const openTeams = useCallback(() => {
    openSettings()
  }, [openSettings])

  const openActivity = useCallback(() => {
    if (shouldKeepTasksWhenOpening(state.navStack)) {
      replaceStack(recipeSwapPrimaryKeepTasks(state.navStack, { type: 'activity' }))
      return
    }
    replaceStack([{ type: 'activity' }])
  }, [state.navStack, replaceStack])

  const toggleActivityFromActionBar = useCallback(() => {
    if (selectActionBarActiveId(state) === 'activity') {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'activity'))
      return
    }
    openActivity()
  }, [state, openActivity, replaceStack])

  const openLeadDetails = useCallback((leadId) => {
    replaceStack(recipeOpenLeadDetails(state.navStack, leadId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openLeadDetailFromTasks = useCallback((leadId) => {
    replaceStack(recipeOpenStandaloneLeadDetail(state.navStack, leadId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openLeadDetailFromSchedule = useCallback((leadId) => {
    replaceStack(recipeOpenLeadDetailFromSchedule(state.navStack, leadId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openDealDetailFromTasks = useCallback((dealId, pipelineId) => {
    replaceStack(recipeOpenStandaloneDealDetail(state.navStack, dealId, pipelineId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openDealFromLead = useCallback((dealId, pipelineId) => {
    replaceStack(recipeOpenDealFromLeadDetail(state.navStack, dealId, pipelineId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

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
    replaceStack(recipeViewListContents(state.navStack, listId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const openSkipTraced = useCallback(() => {
    replaceStack(recipeOpenSkipTraced(state.navStack))
  }, [state.navStack, replaceStack])

  const openOutreach = useCallback((initialTab = 'email') => {
    if (stackHasPrimaryRoot(state.navStack, 'outreach')) {
      replaceStack(recipeClosePrimaryRoot(state.navStack, 'outreach'))
      return
    }
    replaceStack(recipeOpenOutreach(state.navStack, initialTab, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const navigateFromFeed = useCallback((data, ctx) => {
    const result = feedDataToFrames(data, ctx)
    if (!result.ok) return result
    replaceStack(result.frames)
    return result
  }, [replaceStack])

  const navigateFromActivity = useCallback((data, ctx) => {
    const result = feedDataToFrames(data, ctx, { standaloneDetail: true })
    if (!result.ok) return result
    replaceStack(recipeNavigateFromActivity(state.navStack, result.frames, taskDockOpts()))
    return result
  }, [replaceStack, state.navStack, taskDockOpts])

  const returnToActivity = useCallback(() => {
    replaceStack(recipeReturnToActivity(state.navStack))
  }, [replaceStack, state.navStack])

  const closeActivity = useCallback(() => {
    if (state.navStack[0]?.type === 'activity' && state.navStack.length === 1) {
      replaceStack([])
    } else {
      pop()
    }
  }, [state.navStack, replaceStack, pop])

  const setActivityOpen = useCallback((open) => {
    if (open) {
      if (shouldKeepTasksWhenOpening(state.navStack)) {
        replaceStack(recipeSwapPrimaryKeepTasks(state.navStack, { type: 'activity' }))
      } else {
        replaceStack([{ type: 'activity' }])
      }
    } else if (state.navStack[state.navStack.length - 1]?.type === 'activity') {
      replaceStack([])
    }
  }, [state.navStack, replaceStack])

  // Panel overlay navigation helpers
  const pushLeadsDetail = useCallback((leadId) => {
    replaceStack(recipeOpenLeadDetails(state.navStack, leadId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const closeLeadsDetail = useCallback(() => {
    const next = recipeClosePromotedLeadDetail(state.navStack)
    if (next) replaceStack(next)
    else popIfTop('leads.detail')
  }, [state.navStack, replaceStack, popIfTop])

  const popLeadsDetail = closeLeadsDetail

  const pushDealsDetail = useCallback((dealId, pipelineId) => {
    replaceStack(recipePushDealsDetail(state.navStack, dealId, pipelineId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const closeDealsDetail = useCallback(() => {
    const next =
      recipeClosePromotedDealDetail(state.navStack) ??
      recipeClosePromotedPipesDealDetail(state.navStack)
    if (next) replaceStack(next)
    else popIfTop('deals.detail')
  }, [state.navStack, replaceStack, popIfTop])

  const popDealsDetail = closeDealsDetail

  const closeDealsClosed = useCallback(() => {
    const next = recipeClosePromotedClosedDeal(state.navStack)
    if (next) replaceStack(next)
    else popIfTop('deals.closed')
  }, [state.navStack, replaceStack, popIfTop])

  const pushDealsClosed = useCallback((closedRecordId) => {
    replaceStack(recipePushDealsClosed(state.navStack, closedRecordId))
  }, [state.navStack, replaceStack])

  const pushDealsLead = useCallback((leadId) => {
    replaceStack(recipePushDealsLead(state.navStack, leadId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const pushPipesDeal = useCallback((dealId) => {
    replaceStack(recipePushPipesDeal(state.navStack, dealId, taskDockOpts()))
  }, [state.navStack, replaceStack, taskDockOpts])

  const pushPipesLead = useCallback((leadId) => {
    push({ type: 'pipes.lead', leadId })
  }, [push])

  const pushScheduleLead = useCallback((leadId) => {
    openLeadDetailFromSchedule(leadId)
  }, [openLeadDetailFromSchedule])

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
    replaceStack(recipePushQuotesDetail(state.navStack, quoteId))
  }, [state.navStack, replaceStack])

  const pushReportsEditor = useCallback((editorFrame) => {
    push({ type: 'reports.editor', ...editorFrame })
  }, [push])

  const patchReportsEditor = useCallback((patch) => {
    dispatch({
      type: NAV_ACTIONS.PATCH_NAV_FRAME,
      payload: { frameType: 'reports.editor', patch },
    })
  }, [])

  const pushReportsDetail = useCallback((reportId) => {
    push({ type: 'reports.detail', reportId })
  }, [push])

  const pushTeamsDetail = useCallback((teamId) => {
    const withoutDetail = state.navStack.filter((f) => f.type !== 'teams.detail')
    const hasSettings = withoutDetail.some((f) => f.type === 'settings')
    const nextStack = hasSettings
      ? [...withoutDetail, { type: 'teams.detail', teamId }]
      : recipeOpenSettings(withoutDetail).concat([{ type: 'teams.detail', teamId }])
    replaceStack(nextStack)
  }, [state.navStack, replaceStack])

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
    closeTasksPanel,
    openSchedule,
    openLists,
    openPaths,
    openForms,
    openQuotes,
    openReports,
    openTeams,
    openSettings,
    openActivity,
    toggleActivityFromActionBar,
    openLeadDetails,
    openLeadDetailFromTasks,
    openLeadDetailFromSchedule,
    openDealDetailFromTasks,
    openDealFromLead,
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
    closeLeadsDetail,
    pushDealsDetail,
    popDealsDetail,
    closeDealsDetail,
    pushDealsClosed,
    closeDealsClosed,
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
    patchReportsEditor,
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
    closeTasksPanel,
    openSchedule,
    openLists,
    openPaths,
    openForms,
    openQuotes,
    openReports,
    openTeams,
    openSettings,
    openActivity,
    toggleActivityFromActionBar,
    openLeadDetails,
    openLeadDetailFromTasks,
    openLeadDetailFromSchedule,
    openDealDetailFromTasks,
    openDealFromLead,
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
    closeLeadsDetail,
    pushDealsDetail,
    popDealsDetail,
    closeDealsDetail,
    pushDealsClosed,
    closeDealsClosed,
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
    patchReportsEditor,
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
