import { describe, it, expect } from 'vitest'
import {
  normalizeCustomFieldDefs,
  coerceCustomFieldValue,
  resolveLeadCustomFields,
  resolveDealCustomFields,
  canEditLeadCustomFields,
  createDraftCustomField,
} from '../customFields'

describe('normalizeCustomFieldDefs', () => {
  it('normalizes text number date select fields', () => {
    const result = normalizeCustomFieldDefs([
      { id: 'roof_age', label: 'Roof age', type: 'number' },
      { id: 'notes', label: 'Extra notes', type: 'text' },
      { id: 'inspect', label: 'Inspect on', type: 'date' },
      { id: 'tier', label: 'Tier', type: 'select', options: ['A', 'B', 'A', ''] },
    ])
    expect(result).toEqual([
      { id: 'roof_age', label: 'Roof age', type: 'number' },
      { id: 'notes', label: 'Extra notes', type: 'text' },
      { id: 'inspect', label: 'Inspect on', type: 'date' },
      { id: 'tier', label: 'Tier', type: 'select', options: ['A', 'B'] },
    ])
  })

  it('drops select fields without options', () => {
    const result = normalizeCustomFieldDefs([
      { id: 'bad', label: 'Bad', type: 'select', options: [] },
    ])
    expect(result).toEqual([])
  })

  it('slugifies missing ids from labels', () => {
    const result = normalizeCustomFieldDefs([
      { label: 'Square Footage', type: 'number' },
    ])
    expect(result[0].id).toBe('square_footage')
  })
})

describe('coerceCustomFieldValue', () => {
  it('coerces by type', () => {
    expect(coerceCustomFieldValue({ type: 'number' }, '12.5')).toBe(12.5)
    expect(coerceCustomFieldValue({ type: 'number' }, 'x')).toBeNull()
    expect(coerceCustomFieldValue({ type: 'date' }, '2024-05-01T12:00:00Z')).toBe('2024-05-01')
    expect(coerceCustomFieldValue({ type: 'date' }, 'nope')).toBeNull()
    expect(coerceCustomFieldValue({ type: 'select', options: ['A', 'B'] }, 'A')).toBe('A')
    expect(coerceCustomFieldValue({ type: 'select', options: ['A'] }, 'Z')).toBeNull()
    expect(coerceCustomFieldValue({ type: 'text' }, '  hi  ')).toBe('hi')
  })
})

describe('resolveLeadCustomFields / resolveDealCustomFields', () => {
  it('prefers team defs over personal settings', () => {
    const teamFields = [{ id: 'team_f', label: 'Team', type: 'text' }]
    const lead = resolveLeadCustomFields({
      settings: { leadCustomFields: [{ id: 'solo', label: 'Solo', type: 'text' }] },
      teams: [{ id: 't1', leadCustomFields: teamFields }],
      teamMembership: { teamId: 't1', role: 'member' },
    })
    expect(lead.map((f) => f.id)).toEqual(['team_f'])

    const deal = resolveDealCustomFields({
      settings: { dealCustomFields: [{ id: 'solo_d', label: 'Solo', type: 'text' }] },
      teams: [{ id: 't1', dealCustomFields: [{ id: 'team_d', label: 'Team D', type: 'text' }] }],
      teamMembership: { teamId: 't1', role: 'admin' },
    })
    expect(deal.map((f) => f.id)).toEqual(['team_d'])
  })

  it('uses personal settings for solo users', () => {
    const result = resolveLeadCustomFields({
      settings: { leadCustomFields: [{ id: 'solo', label: 'Solo', type: 'text' }] },
      teamMembership: null,
    })
    expect(result[0].id).toBe('solo')
  })
})

describe('canEditLeadCustomFields', () => {
  it('allows solo and team admins only', () => {
    expect(canEditLeadCustomFields(null)).toBe(true)
    expect(canEditLeadCustomFields({ role: 'admin' })).toBe(true)
    expect(canEditLeadCustomFields({ role: 'member' })).toBe(false)
  })
})

describe('createDraftCustomField', () => {
  it('creates select drafts with a default option', () => {
    const draft = createDraftCustomField('Priority', [], 'select')
    expect(draft.type).toBe('select')
    expect(draft.options).toEqual(['Option 1'])
  })
})
