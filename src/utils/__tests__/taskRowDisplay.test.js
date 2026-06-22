import { describe, it, expect } from 'vitest'
import { getTaskRowDisplayFields, getScheduleTaskDisplay } from '@/utils/taskRowDisplay'

const leads = [{ id: 'l1', firstName: 'Jane', lastName: 'Doe', parcelId: 'p1' }]
const deals = [{ id: 'd1', title: 'Roof job' }]

describe('getTaskRowDisplayFields', () => {
  it('panel shows shared, lead, deal, and due', () => {
    const task = {
      title: 'Call',
      leadId: 'l1',
      dealId: 'd1',
      __source: 'team',
      scheduledAt: Date.now() + 86400000,
    }
    const fields = getTaskRowDisplayFields(task, 'panel', { displayLeads: leads, allDeals: deals })
    expect(fields.showShared).toBe(true)
    expect(fields.leadLabel).toBe('Jane Doe')
    expect(fields.dealLabel).toBe('Roof job')
    expect(fields.dueLabel).toBeTruthy()
  })

  it('lead context hides lead and shows deal for deal tasks', () => {
    const task = { dealId: 'd1', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'lead', { allDeals: deals })
    expect(fields.leadLabel).toBeNull()
    expect(fields.dealLabel).toBe('Roof job')
    expect(fields.showShared).toBe(false)
  })

  it('lead context shows only due for lead-only tasks', () => {
    const task = { leadId: 'l1', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'lead', { displayLeads: leads })
    expect(fields.leadLabel).toBeNull()
    expect(fields.dealLabel).toBeNull()
    expect(fields.dueLabel).toBeTruthy()
  })

  it('deal context hides deal and shows lead for lead-only tasks', () => {
    const task = { leadId: 'l1', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'deal', { displayLeads: leads })
    expect(fields.leadLabel).toBe('Jane Doe')
    expect(fields.dealLabel).toBeNull()
  })

  it('deal context shows only due for deal tasks', () => {
    const task = { dealId: 'd1', leadId: 'l1', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'deal', { displayLeads: leads, allDeals: deals })
    expect(fields.leadLabel).toBeNull()
    expect(fields.dealLabel).toBeNull()
    expect(fields.dueLabel).toBeTruthy()
  })
})

describe('getScheduleTaskDisplay', () => {
  it('includes title and lead/deal context', () => {
    const task = {
      title: 'Site visit',
      leadId: 'l1',
      dealId: 'd1',
      scheduledAt: Date.now() + 86400000,
    }
    const display = getScheduleTaskDisplay(task, { displayLeads: leads, allDeals: deals })
    expect(display.title).toBe('Site visit')
    expect(display.contextLabel).toBe('Jane Doe · Roof job')
    expect(display.tooltip).toBe('Site visit · Jane Doe · Roof job')
  })

  it('falls back to team task label when no lead or deal', () => {
    const task = { title: 'Standup', __source: 'team', scheduledAt: Date.now() + 86400000 }
    const display = getScheduleTaskDisplay(task, {})
    expect(display.contextLabel).toBe('Team task')
  })
})
