import { describe, it, expect } from 'vitest'
import {
  leadStatusColorToHex,
  getLeadStatusMapColor,
  hexToRgba,
  LEAD_STATUS_TOKEN_HEX,
} from '../leadStatusMapColors'
import { DEFAULT_LEAD_STATUSES } from '../leadStatuses'

describe('leadStatusColorToHex', () => {
  it('maps Tailwind palette tokens from status color classes', () => {
    expect(leadStatusColorToHex('bg-blue-500/20 text-blue-200 border-blue-400/40')).toBe(
      LEAD_STATUS_TOKEN_HEX.blue,
    )
    expect(leadStatusColorToHex('bg-amber-500/20 text-amber-200 border-amber-400/40')).toBe(
      LEAD_STATUS_TOKEN_HEX.amber,
    )
    expect(leadStatusColorToHex('bg-slate-500/25 text-slate-200 border-slate-400/40')).toBe(
      LEAD_STATUS_TOKEN_HEX.slate,
    )
  })

  it('accepts raw hex and falls back to slate', () => {
    expect(leadStatusColorToHex('#AbCdEf')).toBe('#abcdef')
    expect(leadStatusColorToHex('#abc')).toBe('#aabbcc')
    expect(leadStatusColorToHex('not-a-color')).toBe(LEAD_STATUS_TOKEN_HEX.slate)
    expect(leadStatusColorToHex('')).toBe(LEAD_STATUS_TOKEN_HEX.slate)
  })
})

describe('getLeadStatusMapColor', () => {
  it('resolves default status ids to palette hex', () => {
    expect(getLeadStatusMapColor('contacted', DEFAULT_LEAD_STATUSES)).toBe(LEAD_STATUS_TOKEN_HEX.blue)
    expect(getLeadStatusMapColor('converted', DEFAULT_LEAD_STATUSES)).toBe(LEAD_STATUS_TOKEN_HEX.green)
    expect(getLeadStatusMapColor('lost', DEFAULT_LEAD_STATUSES)).toBe(LEAD_STATUS_TOKEN_HEX.red)
  })
})

describe('hexToRgba', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#3b82f6', 0.5)).toBe('rgba(59,130,246,0.5)')
  })
})
