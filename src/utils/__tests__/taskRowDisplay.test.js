import { describe, it, expect } from 'vitest'
import { getTaskRowDisplayFields, getScheduleTaskDisplay } from '@/utils/taskRowDisplay'

const leads = [{ id: 'l1', firstName: 'Jane', lastName: 'Doe', parcelId: 'p1' }]
const deals = [{ id: 'd1', title: 'Roof job', leadName: 'Jane Doe', leadAddress: '1 Main St' }]

describe('getTaskRowDisplayFields', () => {
  it('panel shows lead and deal names without shared icon when linked', () => {
    const task = {
      title: 'Call',
      leadId: 'l1',
      dealId: 'd1',
      __source: 'team',
      scheduledAt: Date.now() + 86400000,
    }
    const fields = getTaskRowDisplayFields(task, 'panel', { displayLeads: leads, allDeals: deals })
    expect(fields.showShared).toBe(false)
    expect(fields.leadLabel).toBe('Jane Doe')
    expect(fields.dealLabel).toBe('Roof job')
    expect(fields.dueLabel).toBeTruthy()
  })

  it('panel does not fall back to raw lead or deal ids', () => {
    const task = {
      title: 'Follow up',
      leadId: 'missing-lead',
      dealId: 'missing-deal',
      __source: 'server',
      scheduledAt: Date.now() + 86400000,
    }
    const fields = getTaskRowDisplayFields(task, 'panel', { displayLeads: leads, allDeals: deals })
    expect(fields.leadLabel).toBeNull()
    expect(fields.dealLabel).toBeNull()
    expect(fields.showShared).toBe(false)
  })

  it('panel uses deal leadName when lead record is missing', () => {
    const task = {
      title: 'Site visit',
      leadId: 'gone',
      dealId: 'd1',
      scheduledAt: Date.now() + 86400000,
    }
    const fields = getTaskRowDisplayFields(task, 'panel', { displayLeads: [], allDeals: deals })
    expect(fields.leadLabel).toBe('Jane Doe')
    expect(fields.dealLabel).toBe('Roof job')
  })

  it('panel ignores deal title when it is just the deal id', () => {
    const idDeal = [{ id: 'd9', title: 'd9', leadName: 'Acme Roofing' }]
    const task = { title: 'Call', dealId: 'd9', leadId: 'l1', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'panel', { displayLeads: leads, allDeals: idDeal })
    expect(fields.dealLabel).toBe('Acme Roofing')
    expect(fields.leadLabel).toBe('Jane Doe')
  })

  it('panel shows shared icon only when there is no lead or deal link', () => {
    const task = { title: 'Standup', __source: 'team', scheduledAt: Date.now() + 86400000 }
    const fields = getTaskRowDisplayFields(task, 'panel', {})
    expect(fields.showShared).toBe(true)
    expect(fields.leadLabel).toBeNull()
    expect(fields.dealLabel).toBeNull()
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
