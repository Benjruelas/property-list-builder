import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  navigationReducer,
  resetToMapFull,
} from '../navigationReducer.js'
import { NAV_ACTIONS } from '../types.js'
import { selectPanelProps, selectIsStackedUnderSchedule } from '../selectors.js'
import { feedDataToFrames } from '../feedNavigation.js'
import {
  recipeOpenLeads,
  recipeOpenScheduleAtDate,
  recipeNavigateFromActivity,
  recipeOpenQuoteEditorFromDeal,
  recipeOpenReports,
  recipeOpenDealInPipes,
  recipeOpenLeadDetails,
  recipePushDealsClosed,
  recipePushDealsDetail,
} from '../recipes.js'

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

  it('pops nested leads.detail before leads root', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1' },
    ])
    state = pop(state)
    expect(state.navStack).toEqual([{ type: 'leads' }])
    state = pop(state)
    expect(state.navStack).toEqual([])
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
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1' },
    ])
    const props = selectPanelProps(state)
    expect(props.isActivityPanelOpen).toBe(true)
    expect(props.isActivityPanelFocused).toBe(false)
    expect(props.isLeadsPanelOpen).toBe(true)
  })

  it('activity stack: back from nested detail returns to activity', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'leads' },
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

  it('activity stack: nested pipes.deal back returns to activity', () => {
    let state = replaceStack(createInitialState(), [
      { type: 'activity' },
      { type: 'pipes', pipelineId: 'p1' },
      { type: 'pipes.deal', dealId: 'd1' },
    ])
    state = pop(state)
    expect(state.navStack.map((f) => f.type)).toEqual(['activity'])
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

  it('maps lead notification to leads.detail', () => {
    const r = feedDataToFrames({ type: 'lead', leadId: 'l1' }, ctx)
    expect(r.ok).toBe(true)
    expect(r.frames).toEqual([
      { type: 'leads' },
      { type: 'leads.detail', leadId: 'l1' },
    ])
  })

  it('maps deal notification to pipes.deal', () => {
    const r = feedDataToFrames({ type: 'deal', dealId: 'd1', pipelineId: 'pipe1' }, ctx)
    expect(r.frames).toEqual([
      { type: 'pipes', pipelineId: 'pipe1' },
      { type: 'pipes.deal', dealId: 'd1' },
    ])
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

  it('openScheduleAtDate stacks on leads', () => {
    const stack = recipeOpenScheduleAtDate([{ type: 'leads' }], '2025-06-01')
    expect(stack.map((f) => f.type)).toEqual(['leads', 'schedule'])
  })

  it('navigateFromActivity prefixes activity frame', () => {
    const stack = recipeNavigateFromActivity([], [{ type: 'forms' }])
    expect(stack[0].type).toBe('activity')
  })

  it('quote editor keeps pipes and deals', () => {
    const stack = recipeOpenQuoteEditorFromDeal(
      [{ type: 'pipes' }, { type: 'deals' }],
      { dealId: 'd1' },
    )
    expect(stack.some((f) => f.type === 'pipes')).toBe(true)
    expect(stack.some((f) => f.type === 'quotes.editor')).toBe(true)
  })

  it('openReports replaces other panels', () => {
    const stack = recipeOpenReports([{ type: 'tasks' }])
    expect(stack.map((f) => f.type)).toEqual(['reports'])
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

  it('recipeOpenDealInPipes preserves activity prefix', () => {
    const stack = recipeOpenDealInPipes(
      [{ type: 'activity' }, { type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }],
      'p1',
      'd1',
    )
    expect(stack.map((f) => f.type)).toEqual(['activity', 'pipes', 'pipes.deal'])
  })

  it('recipeOpenDealInPipes without activity replaces destination', () => {
    const stack = recipeOpenDealInPipes([{ type: 'leads' }], 'p1', 'd1')
    expect(stack.map((f) => f.type)).toEqual(['pipes', 'pipes.deal'])
  })

  it('recipeOpenLeadDetails preserves activity prefix', () => {
    const stack = recipeOpenLeadDetails(
      [{ type: 'activity' }, { type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }],
      'l2',
    )
    expect(stack.map((f) => f.type)).toEqual(['activity', 'leads', 'leads.detail'])
    expect(stack[2].leadId).toBe('l2')
  })

  it('recipePushDealsClosed replaces active deal detail', () => {
    const stack = recipePushDealsClosed(
      [{ type: 'deals' }, { type: 'deals.detail', dealId: 'd1', pipelineId: 'p1' }],
      'c1',
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'deals.closed'])
  })

  it('recipePushDealsDetail replaces closed deal view', () => {
    const stack = recipePushDealsDetail(
      [{ type: 'deals' }, { type: 'deals.closed', closedRecordId: 'c1' }],
      'd1',
      'p1',
    )
    expect(stack.map((f) => f.type)).toEqual(['deals', 'deals.detail'])
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
  it('derives panel open flags from stack', () => {
    const state = createInitialState()
    state.navStack = [{ type: 'leads' }, { type: 'leads.detail', leadId: 'l1' }]
    const props = selectPanelProps(state)
    expect(props.isLeadsPanelOpen).toBe(true)
    expect(props.leadsDetailLeadId).toBe('l1')
    expect(props.fromActivity).toBe(false)
  })
})
