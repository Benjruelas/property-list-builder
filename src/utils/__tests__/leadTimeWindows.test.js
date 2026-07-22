import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NEW_LEAD_WINDOW,
  NEW_LEAD_WINDOWS,
  isCreatedWithinDays,
  newLeadWindowLabel,
  nextNewLeadWindow,
} from '../leadTimeWindows'

describe('leadTimeWindows', () => {
  it('exposes 7, 30, and 90 day windows with default 30', () => {
    expect(NEW_LEAD_WINDOWS).toEqual([7, 30, 90])
    expect(DEFAULT_NEW_LEAD_WINDOW).toBe(30)
  })

  it('cycles 30 → 7 → 90 → 30', () => {
    expect(nextNewLeadWindow(30)).toBe(7)
    expect(nextNewLeadWindow(7)).toBe(90)
    expect(nextNewLeadWindow(90)).toBe(30)
  })

  it('falls back to default for unknown window sizes', () => {
    expect(nextNewLeadWindow(14)).toBe(DEFAULT_NEW_LEAD_WINDOW)
  })

  it('formats window labels', () => {
    expect(newLeadWindowLabel(7)).toBe('Last 7 days')
    expect(newLeadWindowLabel(30)).toBe('Last 30 days')
    expect(newLeadWindowLabel(90)).toBe('Last 90 days')
  })

  it('includes createdAt at the start of the local window and excludes older', () => {
    const now = new Date(2026, 6, 22, 15, 30, 0) // Jul 22, 2026 local
    const startOfWindow = new Date(2026, 6, 16, 0, 0, 0) // Jul 16 = today + prior 6 days for last 7
    const justBefore = new Date(2026, 6, 15, 23, 59, 59)

    expect(isCreatedWithinDays(startOfWindow, 7, now)).toBe(true)
    expect(isCreatedWithinDays(justBefore, 7, now)).toBe(false)
    expect(isCreatedWithinDays(now, 7, now)).toBe(true)
  })

  it('supports 30 and 90 day boundaries', () => {
    const now = new Date(2026, 6, 22, 12, 0, 0)
    const within30 = new Date(2026, 5, 23, 0, 0, 0) // Jun 23
    const before30 = new Date(2026, 5, 22, 23, 59, 59) // Jun 22 evening
    const within90 = new Date(2026, 3, 24, 0, 0, 0) // Apr 24
    const before90 = new Date(2026, 3, 23, 12, 0, 0) // Apr 23

    expect(isCreatedWithinDays(within30, 30, now)).toBe(true)
    expect(isCreatedWithinDays(before30, 30, now)).toBe(false)
    expect(isCreatedWithinDays(within90, 90, now)).toBe(true)
    expect(isCreatedWithinDays(before90, 90, now)).toBe(false)
  })

  it('returns false for missing or invalid createdAt', () => {
    const now = new Date(2026, 6, 22, 12, 0, 0)
    expect(isCreatedWithinDays(null, 30, now)).toBe(false)
    expect(isCreatedWithinDays(undefined, 30, now)).toBe(false)
    expect(isCreatedWithinDays('', 30, now)).toBe(false)
    expect(isCreatedWithinDays('not-a-date', 30, now)).toBe(false)
  })

  it('accepts ISO string createdAt values', () => {
    const now = new Date(2026, 6, 22, 12, 0, 0)
    const iso = new Date(2026, 6, 20, 9, 0, 0).toISOString()
    expect(isCreatedWithinDays(iso, 7, now)).toBe(true)
  })
})
