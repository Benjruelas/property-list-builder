import { describe, it, expect } from 'vitest'
import { resolveTourSelector, stepUsesActionBar } from '../welcomeTourUtils'
import {
  DESKTOP_TOUR_ORDER,
  MOBILE_TOUR_ORDER,
  TOUR_STEPS_BY_ID,
  buildVisibleSteps,
} from '../WelcomeTour'
import { DESKTOP_BAR_ORDER, DESKTOP_MENU_OVERFLOW } from '@/config/actionBarLayout'

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

  it('returns menu target for retries when nothing is visible yet on mobile', () => {
    const step = {
      target: '[data-tour="menu-lists"]',
      menuRequired: true,
    }
    expect(resolveTourSelector(step, true, () => null)).toBe('[data-tour="menu-lists"]')
  })

  it('prefers menu target for desktop menuRequired steps when bar is missing', () => {
    const step = {
      target: '[data-tour="action-bar-pipes"]',
      mobileTarget: '[data-tour="menu-pipes"]',
      menuRequired: true,
    }
    expect(resolveTourSelector(step, false, () => null)).toBe('[data-tour="menu-pipes"]')
  })

  it('still uses visible desktop bar target when menuRequired', () => {
    const step = {
      target: '[data-tour="action-bar-activity"]',
      mobileTarget: '[data-tour="menu-notifications"]',
      menuRequired: true,
    }
    const findTarget = (sel) => sel === '[data-tour="action-bar-activity"]'
    expect(resolveTourSelector(step, false, findTarget)).toBe('[data-tour="action-bar-activity"]')
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

  it('walks the compact desktop action bar left-to-right before Menu', () => {
    const barStart = DESKTOP_TOUR_ORDER.indexOf('leads')
    const menuIntro = DESKTOP_TOUR_ORDER.indexOf('navigation')
    const bar = DESKTOP_TOUR_ORDER.slice(barStart, menuIntro + 1)
    expect(bar).toEqual([
      'leads',
      'tasks',
      'schedule',
      'activity',
      'settings-menu',
      'navigation',
    ])

    const barIds = DESKTOP_BAR_ORDER.filter((id) => id !== 'menu')
    expect(bar.slice(0, -1).map((id) => (id === 'settings-menu' ? 'settings' : id))).toEqual(barIds)
  })

  it('walks desktop menu overflow top-to-bottom after Menu intro', () => {
    const overflow = DESKTOP_TOUR_ORDER.slice(
      DESKTOP_TOUR_ORDER.indexOf('navigation') + 1,
      DESKTOP_TOUR_ORDER.indexOf('teams')
    )
    expect(overflow).toEqual([
      'pipes',
      'deals',
      'quotes',
      'forms',
      'reports',
      'lists',
      'paths',
      'outreach',
    ])
    expect(overflow).toEqual([...DESKTOP_MENU_OVERFLOW])
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

  it('keeps spotlight preferences for map chrome and parcel actions', () => {
    expect(TOUR_STEPS_BY_ID['address-search'].tooltipPrefer).toBe('right')
    expect(TOUR_STEPS_BY_ID['multi-select'].tooltipPrefer).toBe('right')
    expect(TOUR_STEPS_BY_ID['path-recording'].tooltipPrefer).toBe('right')
    expect(TOUR_STEPS_BY_ID.recenter.tooltipPrefer).toBe('left')
    expect(TOUR_STEPS_BY_ID.compass.tooltipPrefer).toBe('left')
    expect(TOUR_STEPS_BY_ID['photo-mode'].tooltipPrefer).toBe('left')
    expect(TOUR_STEPS_BY_ID['parcel-action-details'].tooltipPrefer).toBe('above')
    expect(TOUR_STEPS_BY_ID['parcel-action-list'].tooltipPrefer).toBe('above')
    expect(TOUR_STEPS_BY_ID['parcel-action-lead'].tooltipPrefer).toBe('above')
    expect(TOUR_STEPS_BY_ID['parcel-action-photos'].tooltipPrefer).toBe('above')
  })
})
