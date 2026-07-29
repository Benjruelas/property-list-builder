import { describe, it, expect } from 'vitest'
import { getPrimaryBarCount, resolveActionBarLayout, DESKTOP_MENU_OVERFLOW } from '../actionBarLayout'

describe('actionBarLayout', () => {
  it('shows 3 primary items on phone', () => {
    expect(getPrimaryBarCount(390)).toBe(3)
    const { barIds, isDesktop } = resolveActionBarLayout(390)
    expect(barIds).toEqual(['leads', 'tasks', 'schedule', 'menu'])
    expect(isDesktop).toBe(false)
  })

  it('shows compact desktop bar with menu overflow at 768px+', () => {
    const { barIds, overflowPrimaryIds, isDesktop } = resolveActionBarLayout(1600)
    expect(barIds).toEqual([
      'leads', 'tasks', 'schedule', 'activity', 'settings', 'menu',
    ])
    expect(overflowPrimaryIds).toEqual(DESKTOP_MENU_OVERFLOW)
    expect(isDesktop).toBe(true)
    expect(barIds).not.toContain('pipes')
    expect(overflowPrimaryIds).toContain('pipes')
    expect(overflowPrimaryIds).toContain('quotes')
  })

  it('keeps three primaries plus menu on phone', () => {
    expect(resolveActionBarLayout(700).barIds).toEqual(['leads', 'tasks', 'schedule', 'menu'])
    expect(resolveActionBarLayout(700).isDesktop).toBe(false)
  })

  it('switches to desktop layout at 768px', () => {
    const layout = resolveActionBarLayout(768)
    expect(layout.isDesktop).toBe(true)
    expect(layout.barIds).toContain('menu')
    expect(layout.barIds).toContain('settings')
    expect(layout.barIds).not.toContain('photoMode')
  })
})
