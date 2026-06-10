import { describe, it, expect } from 'vitest'
import { getPrimaryBarCount, resolveActionBarLayout } from '../actionBarLayout'

describe('actionBarLayout', () => {
  it('shows 3 primary items on phone', () => {
    expect(getPrimaryBarCount(390)).toBe(3)
    const { barIds } = resolveActionBarLayout(390)
    expect(barIds).toEqual(['pipes', 'tasks', 'schedule', 'menu'])
  })

  it('shows full desktop bar at 1440px+', () => {
    const { barIds, overflowPrimaryIds } = resolveActionBarLayout(1600)
    expect(barIds).toEqual([
      'pipes', 'tasks', 'schedule', 'leads', 'deals', 'quotes', 'forms', 'photos', 'reports', 'lists', 'activity', 'menu',
    ])
    expect(overflowPrimaryIds).toEqual([])
  })

  it('progressively adds leads and deals', () => {
    expect(resolveActionBarLayout(1000).barIds).toContain('leads')
    expect(resolveActionBarLayout(1000).barIds).not.toContain('deals')
    expect(resolveActionBarLayout(1200).barIds).toContain('deals')
  })
})
