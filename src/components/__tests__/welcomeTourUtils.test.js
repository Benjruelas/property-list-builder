import { describe, it, expect } from 'vitest'
import { resolveTourSelector, stepUsesActionBar } from '../welcomeTourUtils'
import {
  DESKTOP_TOUR_ORDER,
  MOBILE_TOUR_ORDER,
  TOUR_STEPS_BY_ID,
  buildVisibleSteps,
} from '../WelcomeTour'

describe('resolveTourSelector', () => {
  it('uses bar target when it is visible', () => {
    const step = {
      target: '[data-tour="menu-leads"]',
      mobileTarget: '[data-tour="action-bar-leads"]',
    }
    const findTarget = (sel) => sel === '[data-tour="action-bar-leads"]'
    expect(resolveTourSelector(step, true, findTarget)).toBe('[data-tour="action-bar-leads"]')
  })

  it('falls back to menu target when bar item is hidden', () => {
    const step = {
      target: '[data-tour="menu-leads"]',
      mobileTarget: '[data-tour="action-bar-leads"]',
    }
    const findTarget = (sel) => sel === '[data-tour="menu-leads"]'
    expect(resolveTourSelector(step, true, findTarget)).toBe('[data-tour="menu-leads"]')
    expect(resolveTourSelector(step, false, findTarget)).toBe('[data-tour="menu-leads"]')
  })

  it('returns menu target for retries when nothing is visible yet', () => {
    const step = {
      target: '[data-tour="menu-lists"]',
      menuRequired: true,
    }
    expect(resolveTourSelector(step, true, () => null)).toBe('[data-tour="menu-lists"]')
  })
})

describe('stepUsesActionBar', () => {
  it('detects action bar spotlight', () => {
    const step = { target: '[data-tour="menu-leads"]', mobileTarget: '[data-tour="action-bar-leads"]' }
    expect(stepUsesActionBar(step, false, (sel) => sel === '[data-tour="action-bar-leads"]')).toBe(true)
    expect(stepUsesActionBar(step, true, () => false)).toBe(false)
  })
})

describe('welcome tour order', () => {
  it('maps every ordered step id to a definition', () => {
    for (const id of [...DESKTOP_TOUR_ORDER, ...MOBILE_TOUR_ORDER]) {
      expect(TOUR_STEPS_BY_ID[id], `missing step: ${id}`).toBeTruthy()
    }
  })

  it('walks map chrome top-left then top-right on desktop', () => {
    const mapChrome = DESKTOP_TOUR_ORDER.slice(0, 6)
    expect(mapChrome).toEqual([
      'address-search',
      'multi-select',
      'path-recording',
      'recenter',
      'compass',
      'photo-mode',
    ])
  })

  it('walks the action bar left-to-right on desktop', () => {
    const bar = DESKTOP_TOUR_ORDER.slice(
      DESKTOP_TOUR_ORDER.indexOf('leads'),
      DESKTOP_TOUR_ORDER.indexOf('settings-menu') + 1
    )
    expect(bar).toEqual([
      'leads',
      'tasks',
      'schedule',
      'pipes',
      'deals',
      'quotes',
      'forms',
      'reports',
      'lists',
      'activity',
      'paths',
      'outreach',
      'settings-menu',
    ])
  })

  it('walks the overflow menu top-to-bottom on mobile', () => {
    const menu = MOBILE_TOUR_ORDER.slice(
      MOBILE_TOUR_ORDER.indexOf('navigation') + 1,
      MOBILE_TOUR_ORDER.indexOf('settings-menu')
    )
    expect(menu).toEqual([
      'activity',
      'pipes',
      'deals',
      'quotes',
      'forms',
      'reports',
      'lists',
      'paths',
      'outreach',
    ])
  })

  it('skips feature-gated steps', () => {
    const steps = buildVisibleSteps(true, (id) => id !== 'deals' && id !== 'quotes')
    expect(steps.some((s) => s.id === 'deals')).toBe(false)
    expect(steps.some((s) => s.id === 'quotes')).toBe(false)
    expect(steps.some((s) => s.id === 'leads')).toBe(true)
  })
})
