import { describe, it, expect } from 'vitest'
import {
  planStatusAutoTasks,
  normalizeAutoTaskTemplates,
  scheduledAtFromDueDaysOffset,
} from '../statusAutoTasks.js'
import {
  normalizeCustomFieldDefs,
  mergeCustomFieldValues,
  coerceCustomFieldValue,
} from '../customFields.js'
import { normalizeLeadStatuses } from '../leadStatuses.js'
import { normalizeDealStatuses } from '../dealStatuses.js'

describe('normalizeAutoTaskTemplates', () => {
  it('keeps titled templates and clamps due days', () => {
    const result = normalizeAutoTaskTemplates([
      { id: 'a', title: ' Call back ', dueDaysOffset: 3.9, assignedUids: ['u1', 'u1', ''] },
      { title: '', dueDaysOffset: 1 },
      { id: 'b', title: 'Send quote', dueDaysOffset: -1 },
    ])
    expect(result).toEqual([
      { id: 'a', title: 'Call back', dueDaysOffset: 3, assignedUids: ['u1'] },
      { id: 'b', title: 'Send quote', dueDaysOffset: null, assignedUids: [] },
    ])
  })
})

describe('planStatusAutoTasks', () => {
  const registry = [
    {
      id: 'contacted',
      label: 'Contacted',
      autoTasks: [{ id: 't1', title: 'Follow up', dueDaysOffset: 2, assignedUids: ['u1'] }],
    },
    { id: 'qualified', label: 'Qualified', autoTasks: [] },
  ]

  it('fires on first enter and marks status fired', () => {
    const plan = planStatusAutoTasks({
      prevStatus: 'new',
      nextStatus: 'contacted',
      statusRegistry: registry,
      firedStatusIds: [],
      nowMs: 1_000_000,
    })
    expect(plan.shouldFire).toBe(true)
    expect(plan.tasksToCreate).toHaveLength(1)
    expect(plan.tasksToCreate[0].title).toBe('Follow up')
    expect(plan.tasksToCreate[0].scheduledAt).toBe(scheduledAtFromDueDaysOffset(2, 1_000_000))
    expect(plan.nextFiredStatusIds).toEqual(['contacted'])
  })

  it('does not re-fire when returning to a previously entered status', () => {
    const plan = planStatusAutoTasks({
      prevStatus: 'qualified',
      nextStatus: 'contacted',
      statusRegistry: registry,
      firedStatusIds: ['contacted'],
    })
    expect(plan.shouldFire).toBe(false)
    expect(plan.tasksToCreate).toEqual([])
    expect(plan.nextFiredStatusIds).toEqual(['contacted'])
  })

  it('skips when status is unchanged', () => {
    const plan = planStatusAutoTasks({
      prevStatus: 'contacted',
      nextStatus: 'contacted',
      statusRegistry: registry,
      firedStatusIds: [],
    })
    expect(plan.shouldFire).toBe(false)
    expect(plan.nextFiredStatusIds).toEqual([])
  })

  it('marks empty-template statuses as fired without creating tasks', () => {
    const plan = planStatusAutoTasks({
      prevStatus: 'new',
      nextStatus: 'qualified',
      statusRegistry: registry,
      firedStatusIds: [],
    })
    expect(plan.shouldFire).toBe(false)
    expect(plan.nextFiredStatusIds).toEqual(['qualified'])
  })

  it('fires on create when prevStatus is null', () => {
    const plan = planStatusAutoTasks({
      prevStatus: null,
      nextStatus: 'contacted',
      statusRegistry: registry,
      firedStatusIds: [],
    })
    expect(plan.shouldFire).toBe(true)
    expect(plan.nextFiredStatusIds).toContain('contacted')
  })
})

describe('status autoTasks round-trip via normalizers', () => {
  it('preserves lead status autoTasks', () => {
    const result = normalizeLeadStatuses([
      {
        id: 'new',
        label: 'New',
        autoTasks: [{ id: 'x', title: 'Welcome call', dueDaysOffset: 1 }],
      },
      { id: 'converted', label: 'Converted' },
    ])
    expect(result.find((s) => s.id === 'new')?.autoTasks).toEqual([
      { id: 'x', title: 'Welcome call', dueDaysOffset: 1, assignedUids: [] },
    ])
  })

  it('preserves deal status autoTasks', () => {
    const result = normalizeDealStatuses([
      {
        id: 'open',
        label: 'Open',
        autoTasks: [{ id: 'y', title: 'Kickoff', dueDaysOffset: 0, assignedUids: ['a'] }],
      },
      { id: 'closed', label: 'Closed' },
    ])
    expect(result.find((s) => s.id === 'open')?.autoTasks?.[0]?.title).toBe('Kickoff')
  })

  it('preserves known status colors on the server', () => {
    const cyan = 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
    const leads = normalizeLeadStatuses([
      { id: 'new', label: 'New', color: cyan },
      { id: 'converted', label: 'Converted' },
    ])
    expect(leads.find((s) => s.id === 'new')?.color).toBe(cyan)

    const deals = normalizeDealStatuses([
      { id: 'open', label: 'Open', color: cyan },
      { id: 'closed', label: 'Closed' },
    ])
    expect(deals.find((s) => s.id === 'open')?.color).toBe(cyan)
  })

  it('falls back when status color is missing or unknown on the server', () => {
    const leads = normalizeLeadStatuses([
      { id: 'new', label: 'New', color: 'nope' },
      { id: 'converted', label: 'Converted' },
    ])
    expect(leads.find((s) => s.id === 'new')?.color).toBe(
      'bg-slate-500/25 text-slate-200 border-slate-400/40',
    )

    const deals = normalizeDealStatuses([
      { id: 'open', label: 'Open' },
      { id: 'closed', label: 'Closed' },
    ])
    expect(deals.find((s) => s.id === 'open')?.color).toBe(
      'bg-slate-500/25 text-slate-200 border-slate-400/40',
    )
  })
})

describe('custom field value merge', () => {
  const defs = normalizeCustomFieldDefs([
    { id: 'claim', label: 'Claim #', type: 'text' },
    { id: 'tier', label: 'Tier', type: 'select', options: ['A', 'B'] },
  ])

  it('merges and coerces values against defs', () => {
    const merged = mergeCustomFieldValues(
      { claim: ' 10 ', tier: 'A', unknown: 'x' },
      { claim: '3' },
      defs,
    )
    expect(merged).toEqual({ claim: '10', tier: 'A' })
  })

  it('preserves existing when body omits customFields', () => {
    const merged = mergeCustomFieldValues(undefined, { claim: '7', tier: 'B' }, defs)
    expect(merged).toEqual({ claim: '7', tier: 'B' })
  })

  it('clears with explicit null', () => {
    const merged = mergeCustomFieldValues({ claim: null }, { claim: '7', tier: 'A' }, defs)
    expect(merged).toEqual({ tier: 'A' })
  })

  it('server coerce matches client expectations', () => {
    expect(coerceCustomFieldValue(defs[0], ' 9 ')).toBe('9')
  })
})
