import { describe, expect, it } from 'vitest'
import {
  listRecentHailMonths,
  parseSpcDailyReport,
  shouldCacheRecentMonth,
} from '../../hail-events.js'

describe('listRecentHailMonths', () => {
  it('includes April 2026 when the compiled archive ends in 2024', () => {
    const months = listRecentHailMonths(new Date('2026-09-08T18:00:00.000Z'), 2024)
    expect(months.some((m) => m.year === 2026 && m.month === 4 && !m.isCurrent)).toBe(true)
    expect(months[0]).toEqual({ year: 2025, month: 1, isCurrent: false })
    expect(months.at(-1)).toEqual({ year: 2026, month: 9, isCurrent: true })
  })
})

describe('shouldCacheRecentMonth', () => {
  it('refuses to cache a month when most daily files failed', () => {
    expect(shouldCacheRecentMonth(0, 30)).toBe(false)
    expect(shouldCacheRecentMonth(5, 30)).toBe(false)
  })

  it('caches a month after most daily files load', () => {
    expect(shouldCacheRecentMonth(18, 30)).toBe(true)
    expect(shouldCacheRecentMonth(8, 8)).toBe(true)
  })
})

describe('parseSpcDailyReport', () => {
  it('keeps White Settlement reports from the 2026-04-25 outbreak', () => {
    const csv = [
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '0330,100,3 S White Settlement,Tarrant,TX,32.72,-97.46,Report from mPING. (FWD)',
      '0351,275,3 W White Settlement,Tarrant,TX,32.76,-97.51,Social media photo. (FWD)',
    ].join('\n')

    const events = parseSpcDailyReport(csv, '260425')
    expect(events).toEqual([
      {
        date: '2026-04-25',
        year: 2026,
        lat: 32.72,
        lng: -97.46,
        size_inches: 1,
        time_utc: '03:30',
      },
      {
        date: '2026-04-25',
        year: 2026,
        lat: 32.76,
        lng: -97.51,
        size_inches: 2.75,
        time_utc: '03:51',
      },
    ])
  })
})
