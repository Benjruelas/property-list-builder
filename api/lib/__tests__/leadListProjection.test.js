import { describe, it, expect } from 'vitest'
import { projectLeadForList, computeLastContactedAt } from '../leadListProjection.js'

describe('leadListProjection', () => {
  it('computes lastContactedAt from outreach activity', () => {
    const lead = {
      activity: [
        { type: 'note', at: '2026-01-01T00:00:00.000Z' },
        { type: 'call', at: '2026-02-01T00:00:00.000Z' },
      ],
    }
    expect(computeLastContactedAt(lead)).toBe('2026-02-01T00:00:00.000Z')
  })

  it('projects list fields and strips heavy arrays', () => {
    const lead = {
      id: 'lead_1',
      firstName: 'A',
      activity: [{ type: 'call', at: '2026-02-01T00:00:00.000Z' }],
      photos: [{ id: 'p1' }, { id: 'p2' }],
    }
    const projected = projectLeadForList(lead)
    expect(projected.activity).toBeUndefined()
    expect(projected.photos).toBeUndefined()
    expect(projected.activityCount).toBe(1)
    expect(projected.photoCount).toBe(2)
    expect(projected.lastContactedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(projected._listView).toBe(true)
  })
})
