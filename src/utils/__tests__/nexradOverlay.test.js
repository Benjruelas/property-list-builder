import { describe, it, expect } from 'vitest'
import {
  STORM_TIMELINE_LOOKBACK_HOURS,
  buildStormTimelineOffsets,
  eventDateTimeUTC,
  hailEventTimelineKey,
  initialStormFrameIndex,
} from '../nexradOverlay.js'

describe('storm radar timeline', () => {
  it('builds hourly offsets from lookback through report time', () => {
    const offsets = buildStormTimelineOffsets(24, 1)
    expect(offsets[0]).toBe(-24)
    expect(offsets[offsets.length - 1]).toBe(0)
    expect(offsets).toHaveLength(25)
    expect(STORM_TIMELINE_LOOKBACK_HOURS).toBe(24)
  })

  it('opens the timeline on the hail report frame, not the lookback start', () => {
    const frames = buildStormTimelineOffsets().map((offsetHours) => ({ offsetHours }))
    expect(initialStormFrameIndex(frames)).toBe(frames.length - 1)
    expect(frames[initialStormFrameIndex(frames)].offsetHours).toBe(0)
  })

  it('falls back to the last frame when report offset is missing', () => {
    expect(initialStormFrameIndex([{ offsetHours: -2 }, { offsetHours: -1 }])).toBe(1)
    expect(initialStormFrameIndex([])).toBe(0)
  })

  it('parses event UTC time for radar alignment', () => {
    const dt = eventDateTimeUTC({ date: '2023-05-15', time_utc: '21:30' })
    expect(dt.toISOString()).toBe('2023-05-15T21:30:00.000Z')
  })

  it('includes lookback hours in the timeline cache key', () => {
    const key = hailEventTimelineKey({
      date: '2023-05-15',
      time_utc: '21:30',
      lat: 32.7,
      lng: -96.8,
      year: 2023,
    })
    expect(key).toContain('lb24')
    expect(key).toContain('2023-05-15')
  })
})
