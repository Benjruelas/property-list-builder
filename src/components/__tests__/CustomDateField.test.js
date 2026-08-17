import { describe, it, expect } from 'vitest'
import { formatCustomDateDisplay, parseCustomDateInput } from '../CustomDateField'

describe('parseCustomDateInput', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parseCustomDateInput('2024-05-01')).toBe('2024-05-01')
  })

  it('parses MM/DD/YYYY', () => {
    expect(parseCustomDateInput('05/01/2024')).toBe('2024-05-01')
    expect(parseCustomDateInput('5/1/24')).toBe('2024-05-01')
  })

  it('rejects invalid dates', () => {
    expect(parseCustomDateInput('13/40/2024')).toBeNull()
    expect(parseCustomDateInput('nope')).toBeNull()
  })

  it('treats empty as null', () => {
    expect(parseCustomDateInput('')).toBeNull()
    expect(parseCustomDateInput('   ')).toBeNull()
  })
})

describe('formatCustomDateDisplay', () => {
  it('formats stored ymd as MM/DD/YYYY', () => {
    expect(formatCustomDateDisplay('2024-05-01')).toBe('05/01/2024')
  })

  it('returns empty for empty', () => {
    expect(formatCustomDateDisplay('')).toBe('')
    expect(formatCustomDateDisplay(null)).toBe('')
  })
})
