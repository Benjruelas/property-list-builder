import { describe, it, expect } from 'vitest'
import {
  STORM_TIMELINE_BEFORE_HOURS,
  STORM_TIMELINE_AFTER_HOURS,
  STORM_SCAN_MAX_DIFF_MS,
  buildStormTimelineOffsets,
  eventDateTimeUTC,
  formatEventTimeLocal,
  formatStormFrameLabel,
  hailEventTimelineKey,
  initialStormFrameIndex,
  pickNearestScanTimestamp,
  preferredRadarProduct,
} from '../nexradOverlay.js'

describe('storm radar timeline', () => {
  it('builds a centered window with fine steps near the report', () => {
    const offsets = buildStormTimelineOffsets()
    expect(offsets[0]).toBe(-STORM_TIMELINE_BEFORE_HOURS)
    expect(offsets[offsets.length - 1]).toBe(STORM_TIMELINE_AFTER_HOURS)
    expect(offsets).toContain(0)
    expect(offsets).toContain(-0.25)
    expect(offsets).toContain(0.25)
    expect(STORM_TIMELINE_BEFORE_HOURS).toBe(6)
    expect(STORM_TIMELINE_AFTER_HOURS).toBe(3)
  })

  it('opens the timeline on the hail report frame', () => {
    const frames = buildStormTimelineOffsets().map((offsetHours) => ({ offsetHours }))
    const idx = initialStormFrameIndex(frames)
    expect(frames[idx].offsetHours).toBe(0)
  })

  it('falls back near the middle when report offset is missing', () => {
    expect(initialStormFrameIndex([{ offsetHours: -2 }, { offsetHours: -1 }, { offsetHours: 1 }])).toBe(1)
    expect(initialStormFrameIndex([])).toBe(0)
  })

  it('parses event UTC time for radar alignment', () => {
    const dt = eventDateTimeUTC({ date: '2023-05-15', time_utc: '21:30' })
    expect(dt.toISOString()).toBe('2023-05-15T21:30:00.000Z')
  })

  it('selects N0R before the N0Q archive and N0Q after', () => {
    expect(preferredRadarProduct({ date: '2010-05-15', time_utc: '21:00', year: 2010 })).toBe('N0R')
    expect(preferredRadarProduct({ date: '2010-11-13', time_utc: '16:00', year: 2010 })).toBe('N0R')
    expect(preferredRadarProduct({ date: '2010-11-13', time_utc: '17:00', year: 2010 })).toBe('N0Q')
    expect(preferredRadarProduct({ date: '2023-06-15', time_utc: '22:00', year: 2023 })).toBe('N0Q')
  })

  it('rejects scans farther than the max diff instead of inventing stamps', () => {
    const at = new Date('2023-05-15T21:00:00Z')
    expect(
      pickNearestScanTimestamp([{ ts: '2023-05-15T18:00:00Z' }], at, STORM_SCAN_MAX_DIFF_MS)
    ).toBeNull()
    expect(
      pickNearestScanTimestamp([{ ts: '2023-05-15T21:05:00Z' }], at, STORM_SCAN_MAX_DIFF_MS)
    ).toBe('202305152105')
    expect(pickNearestScanTimestamp([], at)).toBeNull()
  })

  it('labels frames in Central Time relative to the report', () => {
    const reportAt = new Date('2023-05-15T21:00:00Z')
    const earlier = new Date('2023-05-15T20:45:00Z')
    expect(formatStormFrameLabel(reportAt, reportAt)).toContain('Report')
    expect(formatStormFrameLabel(reportAt, reportAt)).toContain('CT')
    expect(formatStormFrameLabel(earlier, reportAt)).toContain('-15m')
    expect(formatEventTimeLocal('21:00', '2023-05-15')).toMatch(/CT$/)
  })

  it('versions the timeline cache key for the new window', () => {
    const key = hailEventTimelineKey({
      date: '2023-05-15',
      time_utc: '21:30',
      lat: 32.7,
      lng: -96.8,
      year: 2023,
    })
    expect(key).toContain('v3')
    expect(key).toContain('b6')
    expect(key).toContain('a3')
    expect(key).toContain('2023-05-15')
  })
})
