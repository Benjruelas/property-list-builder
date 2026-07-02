import { describe, it, expect } from 'vitest'
import { getTimeWindowRange, isWithinTimeWindow, timeWindowLabel, MANUAL_TIME_WINDOW } from '../photoTimeWindows'

const NOW = new Date('2026-07-15T18:30:00')

describe('photoTimeWindows', () => {
  it('computes today as start-of-day through now', () => {
    const { start, end } = getTimeWindowRange('today', NOW)
    expect(start.toISOString().slice(0, 10)).toBe('2026-07-15')
    expect(start.getHours()).toBe(0)
    expect(end).toEqual(NOW)
  })

  it('computes yesterday as a full previous calendar day', () => {
    const { start, end } = getTimeWindowRange('yesterday', NOW)
    expect(start.toISOString().slice(0, 10)).toBe('2026-07-14')
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })

  it('computes last7 as a 7-day inclusive window ending now', () => {
    const { start, end } = getTimeWindowRange('last7', NOW)
    expect(start.toISOString().slice(0, 10)).toBe('2026-07-09')
    expect(end).toEqual(NOW)
  })

  it('computes last30 as a 30-day inclusive window ending now', () => {
    const { start, end } = getTimeWindowRange('last30', NOW)
    expect(start.toISOString().slice(0, 10)).toBe('2026-06-16')
    expect(end).toEqual(NOW)
  })

  it('isWithinTimeWindow matches dates inside the window and rejects dates outside', () => {
    expect(isWithinTimeWindow(new Date('2026-07-15T10:00:00'), 'today', NOW)).toBe(true)
    expect(isWithinTimeWindow(new Date('2026-07-14T23:59:00'), 'today', NOW)).toBe(false)
    expect(isWithinTimeWindow(new Date('2026-07-08T00:00:00'), 'last7', NOW)).toBe(false)
    expect(isWithinTimeWindow(new Date('2026-06-20T00:00:00'), 'last30', NOW)).toBe(true)
  })

  it('treats manual mode and null dates permissively/strictly as designed', () => {
    expect(isWithinTimeWindow(null, MANUAL_TIME_WINDOW, NOW)).toBe(true)
    expect(isWithinTimeWindow(null, 'today', NOW)).toBe(false)
  })

  it('resolves preset labels', () => {
    expect(timeWindowLabel('last30')).toBe('Last 30 days')
    expect(timeWindowLabel('unknown')).toBe('')
  })
})
