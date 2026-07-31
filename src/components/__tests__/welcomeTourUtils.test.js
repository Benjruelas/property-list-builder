import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveTourSelector,
  stepUsesActionBar,
  alignSideTooltipWithSpotlightTop,
} from '../welcomeTourUtils'
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

  it('audits every step target, menu/settings gates, and copy hooks', () => {
    const dataTourRe = /\[data-tour="([^"]+)"\]/

    for (const id of new Set([...DESKTOP_TOUR_ORDER, ...MOBILE_TOUR_ORDER])) {
      const step = TOUR_STEPS_BY_ID[id]
      expect(step.target || step.mobileTarget, `${id} needs a selector`).toBeTruthy()

      if (step.menuRequired) {
        expect(step.mobileTarget, `${id} menuRequired needs mobileTarget`).toMatch(/menu-/)
      }
      if (step.settingsRequired) {
        expect(step.target).toContain('settings-team-section')
        expect(step.expandSettingsSection).toBe('team')
      }
      if (step.parcelDemo === 'show') {
        expect(step.target).toMatch(/parcel-demo/)
      }

      for (const sel of [step.target, step.mobileTarget].filter(Boolean)) {
        const match = sel.match(dataTourRe)
        if (!match) continue
        // Selector strings are the contract; hooks are wired in chrome/menu/demo.
        expect(match[1].length).toBeGreaterThan(0)
      }
    }

    expect(TOUR_STEPS_BY_ID['address-search'].target).toBe('[data-tour="address-search"]')
    expect(TOUR_STEPS_BY_ID['parcel-action-lead'].title).toBe('Add to Pipeline')
    expect(TOUR_STEPS_BY_ID.forms.desc.toLowerCase()).toMatch(/link|pdf/)
    expect(TOUR_STEPS_BY_ID['address-search'].desc.toLowerCase()).toMatch(/lead|address/)
    expect(TOUR_STEPS_BY_ID.reports.title).toBe('Reports')
    expect(TOUR_STEPS_BY_ID.teams.title).toBe('Team')
    expect(TOUR_STEPS_BY_ID.compass.title).toBe('Compass')
  })

  it('keeps side tooltips from rising above the spotlight on top chrome steps', () => {
    // Tall tooltip centered on a short top-chrome control would start above the focus window.
    expect(
      alignSideTooltipWithSpotlightTop({ top: 8, spotlightTop: 56, placedBeside: true })
    ).toBe(56)
    expect(
      alignSideTooltipWithSpotlightTop({ top: 80, spotlightTop: 56, placedBeside: true })
    ).toBe(80)
    expect(
      alignSideTooltipWithSpotlightTop({ top: 8, spotlightTop: 56, placedBeside: false })
    ).toBe(8)
  })

  it('resolves every desktop overflow step to a menu selector when bar is empty', () => {
    const overflowIds = DESKTOP_TOUR_ORDER.slice(
      DESKTOP_TOUR_ORDER.indexOf('navigation') + 1,
      DESKTOP_TOUR_ORDER.indexOf('teams')
    )
    for (const id of overflowIds) {
      const step = TOUR_STEPS_BY_ID[id]
      expect(step.menuRequired, `${id} should open menu`).toBe(true)
      expect(resolveTourSelector(step, false, () => null)).toBe(step.mobileTarget)
    }
  })

  it('walks every desktop and mobile step against a simulated chrome DOM', () => {
    const dataTourRe = /\[data-tour="([^"]+)"\]/
    const extract = (sel) => sel?.match(dataTourRe)?.[1] ?? null

    const desktopVisible = new Set([
      'address-search',
      'multi-select',
      'path-recording',
      'recenter',
      'compass',
      'photo-mode',
      'parcel-demo-popup',
      'parcel-demo-details',
      'parcel-demo-add-list',
      'parcel-demo-convert-lead',
      'parcel-demo-photos',
      'action-bar-leads',
      'action-bar-tasks',
      'action-bar-schedule',
      'action-bar-activity',
      'action-bar-settings',
      'action-bar-menu',
      // menu open for overflow
      'menu-pipes',
      'menu-deals',
      'menu-quotes',
      'menu-forms',
      'menu-reports',
      'menu-lists',
      'menu-paths',
      'menu-outreach',
      'settings-team-section',
    ])

    const mobileVisible = new Set([
      'address-search',
      'multi-select',
      'path-recording',
      'recenter',
      'compass',
      'photo-mode',
      'parcel-demo-popup',
      'parcel-demo-details',
      'parcel-demo-add-list',
      'parcel-demo-convert-lead',
      'parcel-demo-photos',
      'action-bar-leads',
      'action-bar-tasks',
      'action-bar-schedule',
      'action-bar-menu',
      'menu-notifications',
      'menu-pipes',
      'menu-deals',
      'menu-quotes',
      'menu-forms',
      'menu-reports',
      'menu-lists',
      'menu-paths',
      'menu-outreach',
      'menu-settings',
      'settings-team-section',
    ])

    const findIn = (visible) => (sel) => {
      const id = extract(sel)
      return id && visible.has(id) ? sel : null
    }

    for (const id of DESKTOP_TOUR_ORDER) {
      const step = TOUR_STEPS_BY_ID[id]
      const resolved = resolveTourSelector(step, false, findIn(desktopVisible))
      expect(resolved, `desktop ${id}`).toBeTruthy()
      const hook = extract(resolved)
      if (hook) expect(desktopVisible.has(hook), `desktop ${id} → ${hook}`).toBe(true)
    }

    for (const id of MOBILE_TOUR_ORDER) {
      const step = TOUR_STEPS_BY_ID[id]
      const resolved = resolveTourSelector(step, true, findIn(mobileVisible))
      expect(resolved, `mobile ${id}`).toBeTruthy()
      const hook = extract(resolved)
      if (hook) expect(mobileVisible.has(hook), `mobile ${id} → ${hook}`).toBe(true)
    }
  })

  it('keeps the tour scrim z-index ladder intact', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/#modal-root \.tour-shell\s*\{[^}]*z-index:\s*10100/s)
    expect(css).toMatch(/\.tour-overlay\s*\{[^}]*z-index:\s*10055/s)
    expect(css).toMatch(/\.tour-spotlight\s*\{[^}]*z-index:\s*10059/s)
    expect(css).toMatch(/\.tour-tooltip\s*\{[^}]*z-index:\s*10060/s)
    expect(css).toMatch(/\.tour-demo-parcel-anchor\s*\{[^}]*z-index:\s*10055/s)
    expect(css).toMatch(/\.mobile-action-bar--elevated\s*\{[^}]*z-index:\s*10003/s)
    expect(css).toMatch(/\.mobile-action-bar-menu\s*\{[^}]*z-index:\s*10058/s)
    expect(css).toMatch(/\.mobile-action-bar-menu-backdrop\s*\{[^}]*z-index:\s*10057/s)
    expect(css).toMatch(/0 0 0 9999px rgba\(0,\s*0,\s*0,\s*0\.65\)/)
  })
})
