import { describe, expect, it } from 'vitest'
import { buildDealCountByLeadId } from '@/utils/deals'

describe('buildDealCountByLeadId', () => {
  it('counts deals per lead across pipelines', () => {
    const counts = buildDealCountByLeadId([
      { deals: [{ leadId: 'a' }, { leadId: 'b' }] },
      { deals: [{ leadId: 'a' }] },
    ])
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('missing')).toBeUndefined()
  })
})
