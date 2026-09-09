import { describe, it, expect } from 'vitest'
import { normalizeAutoTaskTemplates } from '../statusAutoTasks'

describe('normalizeAutoTaskTemplates', () => {
  it('trims titles on the save path', () => {
    const result = normalizeAutoTaskTemplates([
      { id: 'a', title: ' Call back ', dueDaysOffset: 2 },
    ])
    expect(result[0].title).toBe('Call back')
  })

  it('preserves mid-edit spaces when allowEmptyTitles is set', () => {
    const result = normalizeAutoTaskTemplates(
      [{ id: 'a', title: 'Follow ', dueDaysOffset: 2 }],
      { allowEmptyTitles: true },
    )
    expect(result[0].title).toBe('Follow ')
  })

  it('keeps a blank title row while editing', () => {
    const result = normalizeAutoTaskTemplates(
      [{ id: 'a', title: '', dueDaysOffset: null }],
      { allowEmptyTitles: true },
    )
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('')
  })
})
