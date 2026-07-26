import { describe, it, expect } from 'vitest'
import { getPrimaryBarCount, resolveActionBarLayout } from '../actionBarLayout'

describe('actionBarLayout', () => {
  it('shows 3 primary items on phone', () => {
    expect(getPrimaryBarCount(390)).toBe(3)
    const { barIds, isDesktop } = resolveActionBarLayout(390)
    expect(barIds).toEqual(['leads', 'tasks', 'schedule', 'menu'])
    expect(isDesktop).toBe(false)
  })

  it('shows full desktop bar at 768px+ with no menu', () => {
    const { barIds, overflowPrimaryIds, isDesktop } = resolveActionBarLayout(1600)
    expect(barIds).toEqual([
      'leads', 'tasks', 'schedule', 'pipes', 'deals', 'quotes', 'forms', 'reports', 'lists', 'activity',
      'photoMode', 'paths', 'outreach', 'settings',
    ])
    expect(overflowPrimaryIds).toEqual([])
    expect(isDesktop).toBe(true)
    expect(barIds).not.toContain('menu')
  })

  it('keeps three primaries plus menu on phone', () => {
    expect(resolveActionBarLayout(700).barIds).toEqual(['leads', 'tasks', 'schedule', 'menu'])
    expect(resolveActionBarLayout(700).isDesktop).toBe(false)
  })

  it('switches to the full bar at 768px', () => {
    const layout = resolveActionBarLayout(768)
    expect(layout.isDesktop).toBe(true)
    expect(layout.barIds).not.toContain('menu')
    expect(layout.barIds).toContain('paths')
    expect(layout.barIds).toContain('settings')
    expect(layout.barIds).toContain('photoMode')
  })
})
