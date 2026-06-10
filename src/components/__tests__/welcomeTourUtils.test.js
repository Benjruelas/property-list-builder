import { describe, it, expect } from 'vitest'
import { resolveTourSelector, stepUsesActionBar } from '../welcomeTourUtils'

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
