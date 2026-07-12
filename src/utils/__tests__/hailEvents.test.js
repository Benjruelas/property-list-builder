import { describe, expect, it } from 'vitest'
import {
  compareHailEventsNewestFirst,
  groupHailEventsByDate,
  summarizeStormDay,
} from '../hailEvents'

describe('hailEvents', () => {
  it('groups same-date reports into one storm day with max size and closest distance', () => {
    const groups = groupHailEventsByDate([
      { date: '2025-06-01', hail_size_inches: 3, distance_mi: 9, time_utc: '21:00' },
      { date: '2025-05-26', hail_size_inches: 1.25, distance_mi: 9.6 },
      { date: '2025-06-01', hail_size_inches: 2.5, distance_mi: 6.5, time_utc: '20:45' },
      { date: '2025-06-01', hail_size_inches: 2, distance_mi: 7, time_utc: '20:30' },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('2025-06-01')
    expect(groups[0].report_count).toBe(3)
    expect(groups[0].max_hail_size_inches).toBe(3)
    expect(groups[0].closest_distance_mi).toBe(6.5)
    expect(groups[0].reports.map((r) => r.hail_size_inches)).toEqual([3, 2.5, 2])
    expect(groups[1].date).toBe('2025-05-26')
    expect(groups[1].report_count).toBe(1)
  })

  it('summarizes an empty day safely', () => {
    expect(summarizeStormDay([])).toEqual({
      date: null,
      report_count: 0,
      max_hail_size_inches: 0,
      closest_distance_mi: null,
      reports: [],
    })
  })

  it('sorts newer dates first and prefers larger then closer reports on the same day', () => {
    const sorted = [
      { date: '2025-06-01', hail_size_inches: 2, distance_mi: 4 },
      { date: '2025-06-02', hail_size_inches: 1, distance_mi: 8 },
      { date: '2025-06-01', hail_size_inches: 2, distance_mi: 2 },
    ].sort(compareHailEventsNewestFirst)

    expect(sorted.map((e) => [e.date, e.distance_mi])).toEqual([
      ['2025-06-02', 8],
      ['2025-06-01', 2],
      ['2025-06-01', 4],
    ])
  })
})
