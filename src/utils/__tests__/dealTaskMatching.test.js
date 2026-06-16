import { describe, expect, it } from 'vitest'
import {
  TASK_LIST_SCOPE,
  filterTasksForScope,
  taskMatchesLead,
  taskMatchesDeal,
  resolveLeadDeals,
} from '../dealTaskMatching'

const leadA = { id: 'lead-a', parcelId: 'parcel-a' }
const leadB = { id: 'lead-b', parcelId: 'parcel-b' }
const dealA1 = { id: 'deal-a1', leadId: 'lead-a', parcelId: 'parcel-a' }
const dealB1 = { id: 'deal-b1', leadId: 'lead-b', parcelId: 'parcel-b' }

const pipelines = [{
  id: 'pipe-1',
  title: 'Sales',
  deals: [dealA1, dealB1],
  leads: [leadA, leadB],
  tasks: [],
}]

describe('task context filtering', () => {
  const allTasks = [
    { id: 't1', title: 'Lead A general', parcelId: 'parcel-a' },
    { id: 't2', title: 'Lead A deal', dealId: 'deal-a1', parcelId: 'parcel-a' },
    { id: 't3', title: 'Lead B deal', dealId: 'deal-b1', parcelId: 'parcel-b' },
    { id: 't4', title: 'Other lead deal on A parcel', dealId: 'deal-b1', parcelId: 'parcel-a' },
    { id: 't5', title: 'Server assigned', leadId: 'lead-a', __source: 'server' },
    { id: 't6', title: 'Standalone', pipelineId: null, parcelId: null },
    { id: 't7', title: 'Lead B general', parcelId: 'parcel-b' },
  ]

  it('ALL scope returns every titled task', () => {
    expect(filterTasksForScope(allTasks, TASK_LIST_SCOPE.ALL)).toHaveLength(7)
  })

  it('LEAD scope returns only tasks linked to that lead', () => {
    const forA = filterTasksForScope(allTasks, TASK_LIST_SCOPE.LEAD, { lead: leadA, pipelines })
    expect(forA.map((t) => t.id).sort()).toEqual(['t1', 't2', 't5'])

    const forB = filterTasksForScope(allTasks, TASK_LIST_SCOPE.LEAD, { lead: leadB, pipelines })
    expect(forB.map((t) => t.id).sort()).toEqual(['t3', 't4', 't7'])
  })

  it('DEAL scope returns only tasks with matching dealId', () => {
    const forDeal = filterTasksForScope(allTasks, TASK_LIST_SCOPE.DEAL, { deal: dealA1 })
    expect(forDeal.map((t) => t.id)).toEqual(['t2'])
  })

  it('does not match another lead via parcel when dealId belongs elsewhere', () => {
    expect(taskMatchesLead(allTasks[3], leadA, pipelines)).toBe(false)
  })

  it('matches explicit leadId on server tasks', () => {
    expect(taskMatchesLead(allTasks[4], leadA, pipelines)).toBe(true)
    expect(taskMatchesLead(allTasks[4], leadB, pipelines)).toBe(false)
  })

  it('taskMatchesDeal requires exact dealId', () => {
    expect(taskMatchesDeal(allTasks[1], dealA1)).toBe(true)
    expect(taskMatchesDeal(allTasks[1], dealB1)).toBe(false)
    expect(taskMatchesDeal(allTasks[0], dealA1)).toBe(false)
  })

  it('resolveLeadDeals finds deals by parcel when leadId missing on deal', () => {
    const deals = resolveLeadDeals(leadA, [{
      id: 'pipe-1',
      deals: [{ id: 'd-parcel', parcelId: 'parcel-a' }],
    }])
    expect(deals).toHaveLength(1)
    expect(deals[0].id).toBe('d-parcel')
  })
})
