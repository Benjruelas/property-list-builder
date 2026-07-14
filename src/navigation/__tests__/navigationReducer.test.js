import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  navigationReducer,
  resetToMapFull,
} from '../navigationReducer.js'
import { NAV_ACTIONS } from '../types.js'
import { selectPanelProps, selectIsStackedUnderSchedule, selectTasksDockLayout, selectActionBarActiveId, selectTopCoreFrame } from '../selectors.js'
import { feedDataToFrames } from '../feedNavigation.js'
import {
  recipeOpenLeads,
  recipeOpenDeals,
  recipeOpenPipes,
  recipeOpenLists,
  recipeViewListContents,
  recipeOpenTasks,
  recipeCloseTasks,
  recipeOpenScheduleAtDate,
  recipeNavigateFromActivity,
  recipeOpenQuoteEditorFromDeal,
  recipePushQuotesDetail,
  recipeOpenReports,
  recipePushReportsDetail,
  recipePushReportsEditor,
  recipeOpenDealInPipes,
  recipePushPipesDeal,
  recipeClosePromotedPipesDealDetail,
  recipeOpenLeadDetails,
  recipeClosePromotedLeadDetail,
  recipeOpenStandaloneLeadDetail,
  recipeOpenLeadDetailFromSchedule,
  recipeOpenStandaloneDealDetail,
  recipeOpenDealFromLeadDetail,
  recipePushDealsClosed,
  recipePushDealsDetail,
  recipePushDealsLead,
} from '../recipes.js'
import { getStandaloneDetailBesideTasks, popFrameIfTopOfCore, recipeClosePrimaryRoot, splitTrailingTasks, stackHasPrimaryRoot } from '../taskDock.js'

function reduce(state, type, payload) {
  return navigationReducer(state, { type, payload })
}

function push(state, frame) {
  return reduce(state, NAV_ACTIONS.PUSH, frame)
}

function pop(state) {
  return reduce(state, NAV_ACTIONS.POP)
}

function replaceStack(state, frames) {
  return reduce(state, NAV_ACTIONS.REPLACE_STACK, frames)
}

describe('navigationReducer', () => {
  it('starts with empty stack', () => {
    const state = createInitialState()
    expect(state.navStack).toEqual([])
  })

  it('resetToMapFull clears everything', () => {
    let state = createInitialState()
    state = replaceStack(state, [{ type: 'leads' }])
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, { type: 'popup', parcelId: 'p1', lat: 0, lng: 0, popupData: {} })
    const next = resetToMapFull(state)
    expect(next.navStack).toEqual([])
    expect(next.mapOverlayStack).toEqual([])
  })

  it('pops promoted leads.detail back to leads list', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ])
    state = pop(state)
    expect(state.navStack).toEqual([{ type: 'leads' }])
    state = pop(state)
    expect(state.navStack).toEqual([])
  })

  it('pops legacy promoted leads.detail without list frame back to leads', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ])
    state = pop(state)
    expect(state.navStack).toEqual([{ type: 'leads' }])
  })

  it('activity stack: back from pipes returns to activity', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'pipes', pipelineId: 'p1' },
    ])
    state = pop(state)
    expect(state.navStack).toEqual([{ type: 'activity' }])
  })

  it('activity panel stays mounted under activity-origin destination', () => {
    const state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads.detail', leadId: 'l1' },
    ])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelOpen).toBe(true)
    expect(props.isActivityPanelFocused).toBe(false)
    expect(props.isLeadsPanelOpen).toBe(false)
    expect(props.leadsDetailLeadId).toBe('l1')
  })

  it('activity stack: back from promoted lead detail returns to activity', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads.detail', leadId: 'l1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity'])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelOpen).toBe(true)
    expect(props.isActivityPanelFocused).toBe(true)
    expect(props.isLeadsPanelOpen).toBe(false)
    expect(props.leadsDetailLeadId).toBe(null)
  })

  it('activity stays focused when docked beside tasks', () => {
    const state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'tasks' },
    ])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelOpen).toBe(true)
    expect(props.isActivityPanelFocused).toBe(true)
    expect(props.isActivityPanelTopLayer).toBe(false)
    expect(props.isTasksPanelOpen).toBe(true)
    expect(props.isTasksPanelTopLayer).toBe(true)
  })

  it('activity stack: back from pipes deal returns to pipes kanban', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'pipes', pipelineId: 'p1' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', returnToPipesList: true },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'pipes'])
  })

  it('activity stack: back from pipes root returns to activity', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'pipes', pipelineId: 'p1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity'])
  })

  it('schedule stacked on leads: back pops schedule only', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'leads' },
      { type: 'schedule', initialDate: '2025-01-01' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['leads'])
    expect(selectIsStackedUnderSchedule(state)).toBe(false)
  })

  it('schedule.lead pops to schedule', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'schedule' },
      { type: 'schedule.lead', leadId: 'l1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['schedule'])
  })

  it('recipeOpenLeadDetailFromSchedule keeps schedule and opens primary lead detail', () => {
    const stack = recipeOpenLeadDetailFromSchedule([{ type: 'schedule' }], 'l1')
    expect(stack.map((f) => f.type)).toEqual(['schedule', 'leads.detail'])
    expect(stack[1].leadId).toBe('l1')
    expect(stack[1].dockBesideTasks).toBe(true)

    let state = replaceStack(createInitialState(), stack)
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['schedule'])
  })

  it('deals closed → lead overlay → back sequence keeps deals root', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'deals' },
      { type: 'deals.closed', closedRecordId: 'c1' },
      { type: 'deals.lead', leadId: 'l1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['deals', 'deals.closed'])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['deals'])
  })

  it('map overlay push and pop restores details after hail', () => {
    let state = createInitialState()
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'parcelDetails',
      parcelId: 'p1',
      source: 'map',
      parcelData: { id: 'p1' },
    })
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'hail',
      parcelId: 'p1',
      parcelData: { id: 'p1' },
    })
    state = reduce(state, NAV_ACTIONS.POP_OVERLAY)
    expect(state.mapOverlayStack.map((o) => o.type)).toEqual(['parcelDetails'])
  })

  it('DISMISS_PARCEL_HAIL_PANELS removes hail and parcel details but keeps popup', () => {
    let state = createInitialState()
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'popup',
      parcelId: 'p1',
      lat: 1,
      lng: 2,
      popupData: {},
    })
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'parcelDetails',
      parcelId: 'p1',
      source: 'map',
      parcelData: { id: 'p1' },
    })
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'hail',
      parcelId: 'p1',
      parcelData: { id: 'p1' },
    })
    state = reduce(state, NAV_ACTIONS.DISMISS_PARCEL_HAIL_PANELS)
    expect(state.mapOverlayStack.map((o) => o.type)).toEqual(['popup'])
  })

  it('selectPanelProps keeps parcel details open while hail is on top', () => {
    let state = createInitialState()
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'parcelDetails',
      parcelId: 'p1',
      source: 'map',
      parcelData: { id: 'p1', lat: 1, lng: 2 },
    })
    state = reduce(state, NAV_ACTIONS.PUSH_OVERLAY, {
      type: 'hail',
      parcelId: 'p1',
      parcelData: { id: 'p1', lat: 1, lng: 2 },
    })
    const props = selectPanelProps(state)
    expect(props.isHailDataOpen).toBe(true)
    expect(props.isParcelDetailsOpen).toBe(true)
    expect(props.hailDataParcel?.id).toBe('p1')
  })
})

describe('feedNavigation', () => {
  const ctx = {
    leads: [{ id: 'l1' }],
    pipelines: [{ id: 'pipe1' }],
    lists: [{ id: 'list1' }],
  }

  it('maps lead notification to promoted leads.detail', () => {
    const r = feedDataToFrames({ type: 'lead', leadId: 'l1' }, ctx)
    expect(r.ok).toBe(true)
    expect(r.frames).toEqual([
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ])
  })

  it('maps deal notification to promoted pipes deal detail', () => {
    const r = feedDataToFrames({ type: 'deal', dealId: 'd1', pipelineId: 'pipe1' }, ctx)
    expect(r.frames).toEqual([
      { type: 'pipes', pipelineId: 'pipe1' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'pipe1', returnToPipesList: true },
    ])
  })

  it('maps lead activity to standalone leads.detail', () => {
    const r = feedDataToFrames({ type: 'lead', leadId: 'l1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([{ type: 'leads.detail', leadId: 'l1' }])
  })

  it('maps deal activity to standalone deals.detail', () => {
    const r = feedDataToFrames({ type: 'deal', dealId: 'd1', pipelineId: 'pipe1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([{ type: 'deals.detail', dealId: 'd1', pipelineId: 'pipe1' }])
  })

  it('maps list activity to standalone lists.parcels', () => {
    const r = feedDataToFrames({ type: 'list', listId: 'list1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([{ type: 'lists.parcels', listId: 'list1' }])
    expect(r.listId).toBe('list1')
  })

  it('maps pipeline activity to map focus only (no pipe panel)', () => {
    const r = feedDataToFrames({ type: 'pipeline', pipelineId: 'pipe1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([])
    expect(r.pipelineId).toBe('pipe1')
  })

  it('maps path activity to map focus only (no paths panel)', () => {
    const r = feedDataToFrames({ type: 'path', pathId: 'path1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([])
    expect(r.pathId).toBe('path1')
  })

  it('maps form activity to standalone forms.fill', () => {
    const r = feedDataToFrames({ type: 'form', templateId: 'tpl1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([{ type: 'forms.fill', templateId: 'tpl1' }])
  })

  it('maps team activity to settings with team detail', () => {
    const r = feedDataToFrames({ type: 'team', teamId: 'team1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([
      { type: 'settings' },
      { type: 'teams.detail', teamId: 'team1' },
    ])
  })

  it('maps quote activity to standalone quotes.detail', () => {
    const r = feedDataToFrames({ panel: 'quotes', quoteId: 'q1' }, ctx, { standaloneDetail: true })
    expect(r.frames).toEqual([{ type: 'quotes.detail', quoteId: 'q1' }])
  })

  it('maps pipelineLeadStage activity to standalone lead detail', () => {
    const r = feedDataToFrames(
      { type: 'pipelineLeadStage', pipelineId: 'pipe1', leadId: 'l1' },
      ctx,
      { standaloneDetail: true },
    )
    expect(r.frames).toEqual([{ type: 'leads.detail', leadId: 'l1' }])
  })

  it('maps pipelineDealStage activity to standalone deal detail', () => {
    const r = feedDataToFrames(
      { type: 'pipelineDealStage', pipelineId: 'pipe1', dealId: 'd1' },
      ctx,
      { standaloneDetail: true },
    )
    expect(r.frames).toEqual([{ type: 'deals.detail', dealId: 'd1', pipelineId: 'pipe1' }])
  })

  it('maps task to tasks only', () => {
    const r = feedDataToFrames({ type: 'task' }, ctx)
    expect(r.frames).toEqual([{ type: 'tasks' }])
  })

  it('rejects inaccessible lead', () => {
    const r = feedDataToFrames({ type: 'lead', leadId: 'missing' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.toast).toBeTruthy()
  })
})

describe('recipes', () => {
  it('openLeads replaces other panels', () => {
    const stack = recipeOpenLeads([{ type: 'tasks' }])
    expect(stack.map((f) => f.type)).toEqual(['leads'])
  })

  it('openLeads keeps tasks when keepTasks (desktop dock)', () => {
    const stack = recipeOpenLeads([{ type: 'tasks' }], { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['leads', 'tasks'])
  })

  it('openDeals swaps leads and keeps tasks when keepTasks (desktop dock)', () => {
    const stack = recipeOpenDeals([{ type: 'leads' }, { type: 'tasks' }], { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['deals', 'tasks'])
  })

  it('openPipes swaps leads and keeps tasks when keepTasks (desktop dock)', () => {
    const stack = recipeOpenPipes([{ type: 'leads' }, { type: 'tasks' }], 'p1', { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['pipes', 'tasks'])
  })

  it('openDeals drops lead detail when swapping primary beside tasks', () => {
    const stack = recipeOpenDeals(
      [{ type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }, { type: 'tasks' }],
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'tasks'])
  })

  it('openLists swaps schedule primary and keeps tasks when keepTasks', () => {
    const stack = recipeOpenLists([{ type: 'schedule' }, { type: 'tasks' }], { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['lists', 'tasks'])
  })

  it('viewListContents swaps primary and keeps tasks when keepTasks', () => {
    const stack = recipeViewListContents(
      [{ type: 'leads' }, { type: 'tasks' }],
      'list-1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['lists', 'lists.parcels', 'tasks'])
  })

  it('viewListContents replaces parcels frame when switching lists with tasks docked', () => {
    const stack = recipeViewListContents(
      [{ type: 'lists' }, { type: 'lists.parcels', listId: 'old' }, { type: 'tasks' }],
      'new-list',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['lists', 'lists.parcels', 'tasks'])
    expect(stack.find((f) => f.type === 'lists.parcels')?.listId).toBe('new-list')
  })

  it('openTasks keeps primary panel when keepPrimary (desktop dock)', () => {
    const stack = recipeOpenTasks([{ type: 'leads' }], { keepPrimary: true })
    expect(stack.map((f) => f.type)).toEqual(['leads', 'tasks'])
  })

  it('openTasks keeps pipes when keepPrimary (desktop dock)', () => {
    const stack = recipeOpenTasks([{ type: 'pipes', pipelineId: 'p1' }], { keepPrimary: true })
    expect(stack.map((f) => f.type)).toEqual(['pipes', 'tasks'])
  })

  it('openTasks recipe leaves stack unchanged when tasks already open', () => {
    const stack = recipeOpenTasks([{ type: 'leads' }, { type: 'tasks' }], { keepPrimary: true })
    expect(stack.map((f) => f.type)).toEqual(['leads', 'tasks'])
  })

  it('closeTasks toggles tasks off while keeping primary (NavigationContext uses this)', () => {
    const stack = recipeCloseTasks([{ type: 'leads' }, { type: 'tasks' }])
    expect(stack.map((f) => f.type)).toEqual(['leads'])
  })

  it('openTasks keeps leads when schedule is stacked on top', () => {
    const stack = recipeOpenTasks(
      [{ type: 'leads' }, { type: 'schedule' }],
      { keepPrimary: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['leads', 'schedule', 'tasks'])
  })

  it('openTasks keeps schedule when only schedule is open', () => {
    const stack = recipeOpenTasks([{ type: 'schedule' }], { keepPrimary: true })
    expect(stack.map((f) => f.type)).toEqual(['schedule', 'tasks'])
  })

  it('closeTasks removes only tasks frame and keeps primary', () => {
    const stack = recipeCloseTasks([{ type: 'leads' }, { type: 'tasks' }])
    expect(stack.map((f) => f.type)).toEqual(['leads'])
  })

  it('closeTasks is noop when tasks not open', () => {
    const stack = recipeCloseTasks([{ type: 'leads' }])
    expect(stack.map((f) => f.type)).toEqual(['leads'])
  })

  it('recipeClosePrimaryRoot removes leads but keeps docked tasks', () => {
    const stack = recipeClosePrimaryRoot([{ type: 'leads' }, { type: 'tasks' }], 'leads')
    expect(stack.map((f) => f.type)).toEqual(['tasks'])
  })

  it('recipeClosePrimaryRoot removes schedule stack but keeps tasks', () => {
    const stack = recipeClosePrimaryRoot(
      [{ type: 'schedule' }, { type: 'schedule.lead', leadId: 'l1' }, { type: 'tasks' }],
      'schedule',
    )
    expect(stack.map((f) => f.type)).toEqual(['tasks'])
  })

  it('stackHasPrimaryRoot detects open pipes', () => {
    expect(stackHasPrimaryRoot([{ type: 'pipes', pipelineId: 'p1' }], 'pipes')).toBe(true)
    expect(stackHasPrimaryRoot([{ type: 'leads' }], 'pipes')).toBe(false)
  })

  it('selectActionBarActiveId prefers pipes over tasks', () => {
    const state = { navStack: [{ type: 'pipes', pipelineId: 'p1' }, { type: 'tasks' }], mapOverlayStack: [], modalStack: [], meta: {} }
    expect(selectActionBarActiveId(state)).toBe('pipes')
  })

  it('selectActionBarActiveId returns activity when only activity open', () => {
    const state = { navStack: [{ type: 'activity' }], mapOverlayStack: [], modalStack: [], meta: {} }
    expect(selectActionBarActiveId(state)).toBe('activity')
  })

  it('splitTrailingTasks peels solo tasks frame for pop protection', () => {
    expect(splitTrailingTasks([{ type: 'tasks' }])).toEqual({
      tasksFrames: [{ type: 'tasks' }],
      coreStack: [],
    })
    expect(splitTrailingTasks([{ type: 'leads' }, { type: 'tasks' }])).toEqual({
      tasksFrames: [{ type: 'tasks' }],
      coreStack: [{ type: 'leads' }],
    })
  })

  it('popFrameIfTopOfCore pops detail frame with trailing tasks', () => {
    const stack = [
      { type: 'deals' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' },
      { type: 'tasks' },
    ]
    expect(popFrameIfTopOfCore(stack, 'deals.detail').map((f) => f.type)).toEqual(['deals', 'tasks'])
    expect(popFrameIfTopOfCore(stack, 'tasks')).toBe(stack)
  })

  it('popFrameIfTopOfCore truncates target frame and everything above it when not top', () => {
    const stack = [
      { type: 'deals' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' },
      { type: 'deals.lead', leadId: 'l1' },
      { type: 'tasks' },
    ]
    // Closing the detail while a lead overlay sits above it still returns to its parent.
    expect(popFrameIfTopOfCore(stack, 'deals.detail').map((f) => f.type)).toEqual(['deals', 'tasks'])
  })

  it('popFrameIfTopOfCore is a no-op when the frame is absent (idempotent double dismiss)', () => {
    const stack = [{ type: 'deals' }, { type: 'tasks' }]
    expect(popFrameIfTopOfCore(stack, 'deals.detail')).toBe(stack)
  })

  it('pop closing primary keeps trailing tasks open', () => {
    let state = replaceStack(createInitialState(), [{ type: 'leads' }, { type: 'tasks' }])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['tasks'])
    expect(selectPanelProps(state).isTasksPanelOpen).toBe(true)
    expect(selectPanelProps(state).isLeadsPanelOpen).toBe(false)
  })

  it('pop is noop when only tasks is open (use closeTasks to dismiss)', () => {
    let state = replaceStack(createInitialState(), [{ type: 'tasks' }])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['tasks'])
  })

  it('double pop after closing primary does not dismiss solo tasks', () => {
    let state = replaceStack(createInitialState(), [{ type: 'leads' }, { type: 'tasks' }])
    state = pop(state)
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['tasks'])
  })

  it('openScheduleAtDate stacks on leads', () => {
    const stack = recipeOpenScheduleAtDate([{ type: 'leads' }], '2025-06-01')
    expect(stack.map((f) => f.type)).toEqual(['leads', 'schedule'])
  })

  it('navigateFromActivity prefixes activity frame', () => {
    const stack = recipeNavigateFromActivity([], [{ type: 'forms' }])
    expect(stack[0].type).toBe('activity')
  })

  it('navigateFromActivity keeps tasks when docked on desktop', () => {
    const stack = recipeNavigateFromActivity(
      [{ type: 'activity' }, { type: 'tasks' }],
      [{ type: 'leads.detail', leadId: 'l1' }],
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['activity', 'leads.detail', 'tasks'])
  })

  it('activity stack: back from standalone detail keeps docked tasks', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'tasks' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'tasks'])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelFocused).toBe(true)
    expect(props.isTasksPanelOpen).toBe(true)
    expect(props.isLeadsPanelOpen).toBe(false)
  })

  it('activity stack: back from nested detail keeps docked tasks', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'tasks' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'tasks'])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelFocused).toBe(true)
    expect(props.isTasksPanelOpen).toBe(true)
  })

  it('activity stack: back from destination keeps docked tasks', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads' },
      { type: 'tasks' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'tasks'])
  })

  it('quote editor keeps pipes and deals', () => {
    const stack = recipeOpenQuoteEditorFromDeal(
      [{ type: 'pipes' }, { type: 'deals' }],
      { dealId: 'd1' },
    )
    expect(stack.some((f) => f.type === 'pipes')).toBe(true)
    expect(stack.some((f) => f.type === 'quotes.editor')).toBe(true)
  })

  it('quote detail keeps quotes list frame on stack', () => {
    const stack = recipePushQuotesDetail([{ type: 'quotes' }], 'q1')
    expect(stack.map((f) => f.type)).toEqual(['quotes', 'quotes.detail'])
    expect(stack[1].quoteId).toBe('q1')

    const swapped = recipePushQuotesDetail(
      [{ type: 'quotes' }, { type: 'quotes.detail', quoteId: 'q1' }],
      'q2',
    )
    expect(swapped.map((f) => f.type)).toEqual(['quotes', 'quotes.detail'])
    expect(swapped[1].quoteId).toBe('q2')
  })

  it('quotes list open state is separate from quote detail', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'quotes' }, { type: 'quotes.detail', quoteId: 'q1' }]
    const props = selectPanelProps(state)
    expect(props.isQuotesPanelOpen).toBe(true)
    expect(props.isQuotesListOpen).toBe(true)
    expect(props.quotesDetailQuoteId).toBe('q1')

    state.navStack = [{ type: 'quotes.detail', quoteId: 'q1' }]
    const solo = selectPanelProps(state)
    expect(solo.isQuotesPanelOpen).toBe(true)
    expect(solo.isQuotesListOpen).toBe(false)
  })

  it('settings top layer wins over lead detail and ignores trailing tasks', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'settings' },
      { type: 'tasks' },
    ]
    expect(selectTopCoreFrame(state)?.type).toBe('settings')
    const props = selectPanelProps(state)
    expect(props.isSettingsPanelOpen).toBe(true)
    expect(props.isSettingsPanelTopLayer).toBe(true)
    expect(props.isLeadsDetailTopLayer).toBe(false)
    expect(props.isTasksPanelTopLayer).toBe(true)
  })

  it('openReports replaces other panels', () => {
    const stack = recipeOpenReports([{ type: 'tasks' }])
    expect(stack.map((f) => f.type)).toEqual(['reports'])
  })

  it('recipePushReportsDetail from lead keeps lead context and sets returnToLead', () => {
    const stack = recipePushReportsDetail(
      [{ type: 'leads' }, { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true }],
      'r1',
    )
    expect(stack.map((f) => f.type)).toEqual([
      'leads',
      'leads.detail',
      'reports.detail',
    ])
    expect(stack[2].reportId).toBe('r1')
    expect(stack[2].returnToLead).toBe(true)
  })

  it('reports list open state is separate from report detail', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'reports' }, { type: 'reports.detail', reportId: 'r1' }]
    const props = selectPanelProps(state)
    expect(props.isReportsPanelOpen).toBe(true)
    expect(props.isReportsListOpen).toBe(true)
    expect(props.reportsDetailReportId).toBe('r1')

    state.navStack = [
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'reports.detail', reportId: 'r1', returnToLead: true },
    ]
    const fromLead = selectPanelProps(state)
    expect(fromLead.isReportsPanelOpen).toBe(true)
    expect(fromLead.isReportsListOpen).toBe(false)
    expect(fromLead.reportsDetailReturnToLead).toBe(true)
  })

  it('recipePushReportsDetail keeps tasks when docked', () => {
    const stack = recipePushReportsDetail(
      [{ type: 'leads' }, { type: 'tasks' }],
      'r1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['reports', 'reports.detail', 'tasks'])
  })

  it('recipePushReportsDetail on existing reports only adds detail', () => {
    const stack = recipePushReportsDetail([{ type: 'reports' }], 'r2')
    expect(stack.map((f) => f.type)).toEqual(['reports', 'reports.detail'])
  })

  it('recipePushReportsEditor from lead keeps lead context and sets returnToLead', () => {
    const stack = recipePushReportsEditor(
      [{ type: 'leads.detail', leadId: 'l1' }],
      { mode: 'report', leadId: 'l1', awaitingTemplate: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['leads.detail', 'reports.editor'])
    expect(stack[1].leadId).toBe('l1')
    expect(stack[1].awaitingTemplate).toBe(true)
    expect(stack[1].returnToLead).toBe(true)
  })

  it('reports editor and detail derive from stack', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'reports' },
      { type: 'reports.editor', leadId: 'l1' },
    ]
    const props = selectPanelProps(state)
    expect(props.isReportsPanelOpen).toBe(true)
    expect(props.reportsEditorFrame?.leadId).toBe('l1')
    state.navStack = [
      { type: 'reports' },
      { type: 'reports.detail', reportId: 'r1' },
    ]
    const detailProps = selectPanelProps(state)
    expect(detailProps.reportsDetailReportId).toBe('r1')
  })

  it('recipeOpenDealInPipes preserves activity prefix and promotes deal detail', () => {
    const stack = recipeOpenDealInPipes(
      [{ type: 'activity' }, { type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }],
      'p1',
      'd1',
    )
    expect(stack.map((f) => f.type)).toEqual(['activity', 'pipes', 'deals.detail'])
    expect(stack[2].returnToPipesList).toBe(true)
  })

  it('recipeOpenDealInPipes without activity replaces destination', () => {
    const stack = recipeOpenDealInPipes([{ type: 'leads' }], 'p1', 'd1')
    expect(stack.map((f) => f.type)).toEqual(['pipes', 'deals.detail'])
    expect(stack[1].returnToPipesList).toBe(true)
  })

  it('recipePushPipesDeal promotes deal beside tasks', () => {
    const stack = recipePushPipesDeal(
      [{ type: 'pipes', pipelineId: 'p1' }, { type: 'tasks' }],
      'd1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['pipes', 'deals.detail', 'tasks'])
    expect(stack[1].returnToPipesList).toBe(true)
  })

  it('recipeClosePromotedPipesDealDetail pops detail and keeps pipes', () => {
    const next = recipeClosePromotedPipesDealDetail([
      { type: 'pipes', pipelineId: 'p1' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', returnToPipesList: true },
      { type: 'tasks' },
    ])
    expect(next.map((f) => f.type)).toEqual(['pipes', 'tasks'])
  })

  it('recipeOpenLeadDetails keeps leads list under detail for Back', () => {
    const stack = recipeOpenLeadDetails([{ type: 'leads' }], 'l1')
    expect(stack).toEqual([
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ])
  })

  it('recipeClosePromotedLeadDetail pops detail and keeps existing leads list', () => {
    const next = recipeClosePromotedLeadDetail([
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ])
    expect(next).toEqual([{ type: 'leads' }])
  })

  it('recipeOpenLeadDetails preserves activity prefix without return flag', () => {
    const stack = recipeOpenLeadDetails(
      [{ type: 'activity' }, { type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }],
      'l2',
    )
    expect(stack.map((f) => f.type)).toEqual(['activity', 'leads.detail'])
    expect(stack[1].leadId).toBe('l2')
    expect(stack[1].returnToLeadsList).toBeUndefined()
  })

  it('recipePushDealsClosed replaces active deal detail', () => {
    const stack = recipePushDealsClosed(
      [{ type: 'deals' }, { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' }],
      'c1',
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'deals.closed'])
    expect(stack[1].returnToDealsList).toBe(true)
  })

  it('recipePushDealsDetail replaces closed deal view', () => {
    const stack = recipePushDealsDetail(
      [{ type: 'deals' }, { type: 'deals.closed', closedRecordId: 'c1' }],
      'd1',
      'p1',
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'deals.detail'])
    expect(stack[1].returnToDealsList).toBe(true)
  })

  it('recipePushDealsDetail from tasks-only stack opens detail and keeps tasks', () => {
    const stack = recipePushDealsDetail([{ type: 'tasks' }], 'd1', 'p1', { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['deals.detail', 'tasks'])
  })

  it('recipeOpenLeadDetails from tasks-only stack opens detail and keeps tasks', () => {
    const stack = recipeOpenLeadDetails([{ type: 'tasks' }], 'l1', { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['leads.detail', 'tasks'])
  })

  it('recipeOpenStandaloneLeadDetail opens detail only beside tasks', () => {
    const stack = recipeOpenStandaloneLeadDetail([{ type: 'tasks' }], 'l1', { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['leads.detail', 'tasks'])
    expect(stack[0].dockBesideTasks).toBe(true)
  })

  it('recipeOpenStandaloneDealDetail opens detail only beside tasks', () => {
    const stack = recipeOpenStandaloneDealDetail([{ type: 'tasks' }], 'd1', 'p1', { keepTasks: true })
    expect(stack.map((f) => f.type)).toEqual(['deals.detail', 'tasks'])
    expect(stack[0].dockBesideTasks).toBe(true)
  })

  it('recipeOpenDealFromLeadDetail opens deal detail without pipes or deals list', () => {
    const stack = recipeOpenDealFromLeadDetail(
      [{ type: 'leads.detail', leadId: 'l1', returnToLeadsList: true }, { type: 'tasks' }],
      'd1',
      'p1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['leads.detail', 'deals.detail', 'tasks'])
    expect(stack[1].dockBesideTasks).toBe(true)
  })

  it('deal opened from lead detail keeps lead as dock anchor beside tasks', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'leads.detail', leadId: 'l1', dockBesideTasks: true },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', dockBesideTasks: true },
      { type: 'tasks' },
    ]
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'leads',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('recipeOpenDealFromLeadDetail replaces pipes stack when opening from lead', () => {
    const stack = recipeOpenDealFromLeadDetail(
      [{ type: 'leads.detail', leadId: 'l1' }, { type: 'pipes', pipelineId: 'p1' }, { type: 'deals.detail', dealId: 'd0', pipelineId: 'p1', returnToPipesList: true }],
      'd1',
      'p1',
    )
    expect(stack.map((f) => f.type)).toEqual(['leads.detail', 'deals.detail'])
  })

  it('recipeOpenDealFromLeadDetail from deals lead overlay closes lead and opens deal', () => {
    const stack = recipeOpenDealFromLeadDetail(
      [
        { type: 'deals' },
        { type: 'deals.detail', dealId: 'd0', pipelineId: 'p1', returnToDealsList: true },
        { type: 'deals.lead', leadId: 'l1' },
        { type: 'tasks' },
      ],
      'd1',
      'p1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'deals.detail', 'tasks'])
    expect(stack[1].dealId).toBe('d1')
  })

  it('pop deals.detail from deals lead overlay returns to lead not map', () => {
    const stack = [
      { type: 'deals' },
      { type: 'deals.lead', leadId: 'l1' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', dockBesideTasks: true },
      { type: 'tasks' },
    ]
    expect(popFrameIfTopOfCore(stack, 'deals.detail').map((f) => f.type)).toEqual([
      'deals',
      'deals.lead',
      'tasks',
    ])
  })

  it('pop deals.detail returns to lead detail', () => {
    const stack = [
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' },
      { type: 'tasks' },
    ]
    expect(popFrameIfTopOfCore(stack, 'deals.detail').map((f) => f.type)).toEqual(['leads.detail', 'tasks'])
  })

  it('recipePushDealsLead from standalone deal keeps tasks trailing and deal beneath lead', () => {
    const stack = recipePushDealsLead(
      [{ type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' }, { type: 'tasks' }],
      'l1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['deals.detail', 'deals.lead', 'tasks'])
  })

  it('recipePushDealsLead from leads lead detail pops deal instead of overlaying', () => {
    const stack = recipePushDealsLead(
      [
        { type: 'leads' },
        { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
        { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', dockBesideTasks: true },
        { type: 'tasks' },
      ],
      'l1',
      { keepTasks: true },
    )
    expect(stack.map((f) => f.type)).toEqual(['leads', 'leads.detail', 'tasks'])
  })

  it('pop deals.lead returns to standalone deal with tasks still trailing', () => {
    const stack = [
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' },
      { type: 'deals.lead', leadId: 'l1' },
      { type: 'tasks' },
    ]
    expect(popFrameIfTopOfCore(stack, 'deals.lead').map((f) => f.type)).toEqual(['deals.detail', 'tasks'])
  })

  it('standalone deal with lead overlay keeps tasks on solo rail', () => {
    const stack = [
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' },
      { type: 'deals.lead', leadId: 'l1' },
      { type: 'tasks' },
    ]
    expect(getStandaloneDetailBesideTasks(stack)).toBe('deals')
    const state = createInitialState()
    state.navStack = stack
    expect(selectTasksDockLayout(state).tasksSoloDetail).toBe(true)
    expect(selectTasksDockLayout(state).soloDetailRoot).toBe('deals')
  })

  it('activity stack: schedule.lead back returns to schedule', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'schedule' },
      { type: 'schedule.lead', leadId: 'l1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'schedule'])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity'])
  })

  it('PATCH_NAV_FRAME clears schedule initialDate', () => {
    let state = createInitialState()
    state = navigationReducer(state, {
      type: NAV_ACTIONS.REPLACE_STACK,
      payload: [{ type: 'schedule', initialDate: '2025-06-01' }],
    })
    state = navigationReducer(state, {
      type: NAV_ACTIONS.PATCH_NAV_FRAME,
      payload: { frameType: 'schedule', patch: { initialDate: undefined } },
    })
    expect(state.navStack[0].initialDate).toBeUndefined()
  })
})

describe('selectors', () => {
  it('derives panel open flags from promoted lead detail', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
    ]
    const props = selectPanelProps(state)
    expect(props.isLeadsPanelOpen).toBe(true)
    expect(props.leadsDetailLeadId).toBe('l1')
    expect(props.isLeadsDetailStandalone).toBe(false)
    expect(props.fromActivity).toBe(false)
  })

  it('legacy promoted lead detail without list still counts as standalone', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'leads.detail', leadId: 'l1', returnToLeadsList: true }]
    const props = selectPanelProps(state)
    expect(props.isLeadsPanelOpen).toBe(false)
    expect(props.leadsDetailLeadId).toBe('l1')
    expect(props.isLeadsDetailStandalone).toBe(true)
  })

  it('standalone lead detail without leads list', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'leads.detail', leadId: 'l1' }, { type: 'tasks' }]
    const props = selectPanelProps(state)
    expect(props.isLeadsPanelOpen).toBe(false)
    expect(props.leadsDetailLeadId).toBe('l1')
    expect(props.isLeadsDetailStandalone).toBe(true)
    expect(props.isTasksPanelOpen).toBe(true)
  })

  it('standalone deal detail without deals list', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' }, { type: 'tasks' }]
    const props = selectPanelProps(state)
    expect(props.isDealsPanelOpen).toBe(false)
    expect(props.dealsDetailDealId).toBe('d1')
    expect(props.isDealsDetailStandalone).toBe(true)
  })

  it('promoted lead detail beside tasks uses docked layout not solo detail', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true },
      { type: 'tasks' },
    ]
    expect(getStandaloneDetailBesideTasks(state.navStack)).toBe(null)
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'leads',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('standalone detail from tasks uses docked primary beside tasks', () => {
    expect(getStandaloneDetailBesideTasks([{ type: 'leads.detail', leadId: 'l1', dockBesideTasks: true }, { type: 'tasks' }])).toBe(null)
    const state = createInitialState()
    state.navStack = [{ type: 'leads.detail', leadId: 'l1', dockBesideTasks: true }, { type: 'tasks' }]
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'leads',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('standalone deal detail from tasks uses docked primary', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1', dockBesideTasks: true },
      { type: 'tasks' },
    ]
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'deals',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('activity-only stack docks tasks beside activity', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'activity' }, { type: 'tasks' }]
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'activity',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('activity lead detail becomes dock primary beside tasks', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'activity' },
      { type: 'leads.detail', leadId: 'l1' },
      { type: 'tasks' },
    ]
    expect(getStandaloneDetailBesideTasks(state.navStack)).toBe(null)
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'leads',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('list from activity keeps list detail docked beside tasks', () => {
    const state = createInitialState()
    state.navStack = [
      { type: 'activity' },
      { type: 'lists.parcels', listId: 'list1' },
      { type: 'tasks' },
    ]
    expect(selectTasksDockLayout(state)).toEqual({
      tasksDocked: true,
      primaryRoot: 'lists',
      tasksSoloDetail: false,
      soloDetailRoot: null,
    })
  })

  it('activity list detail back returns to activity feed', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'lists.parcels', listId: 'list1' },
      { type: 'tasks' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity', 'tasks'])
    expect(selectPanelProps(state).isActivityPanelFocused).toBe(true)
    expect(selectPanelProps(state).isParcelListPanelOpen).toBe(false)
  })
})
