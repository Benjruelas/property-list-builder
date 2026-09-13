import { describe, expect, it } from 'vitest'
import {
  listRecentHailMonths,
  parseSpcDailyReport,
  resolveCompiledDateUtc,
  shouldCacheRecentMonth,
  spcLocalTimeToUtc,
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

describe('spcLocalTimeToUtc', () => {
  it('keeps the UTC calendar day when CST evening times roll past midnight', () => {
    expect(spcLocalTimeToUtc('2023-05-15', '19:00', '3')).toEqual({
      time_utc: '01:00',
      date_utc: '2023-05-16',
    })
    expect(spcLocalTimeToUtc('2023-05-15', '18:00', '3')).toEqual({
      time_utc: '00:00',
      date_utc: '2023-05-16',
    })
    expect(spcLocalTimeToUtc('2023-05-15', '17:00', '3')).toEqual({
      time_utc: '23:00',
      date_utc: '2023-05-15',
    })
  })

  it('leaves GMT reports on the same UTC date', () => {
    expect(spcLocalTimeToUtc('2023-05-15', '03:00', '9')).toEqual({
      time_utc: '03:00',
      date_utc: '2023-05-15',
    })
  })
})

describe('resolveCompiledDateUtc', () => {
  it('recovers the lost next UTC day from cached time_utc-only events', () => {
    expect(resolveCompiledDateUtc({
      date: '2023-05-15',
      time_utc: '01:00',
      year: 2023,
    })).toBe('2023-05-16')
    expect(resolveCompiledDateUtc({
      date: '2023-05-15',
      time_utc: '23:00',
      year: 2023,
    })).toBe('2023-05-15')
  })

  it('prefers an explicit date_utc and skips convective-day events', () => {
    expect(resolveCompiledDateUtc({
      date: '2023-05-15',
      date_utc: '2023-05-16',
      time_utc: '01:00',
    })).toBe('2023-05-16')
    expect(resolveCompiledDateUtc({
      date: '2026-04-25',
      time_utc: '03:30',
      convective_day: true,
    })).toBeNull()
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
        convective_day: true,
      },
      {
        date: '2026-04-25',
        year: 2026,
        lat: 32.76,
        lng: -97.51,
        size_inches: 2.75,
        time_utc: '03:51',
        convective_day: true,
      },
    ])
  })
})
