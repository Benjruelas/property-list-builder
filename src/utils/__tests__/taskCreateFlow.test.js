import { describe, expect, it } from 'vitest'
import {
  resolveTaskContext,
  resolveTaskFormIdsFromTask,
  findLeadByTaskKey,
} from '../taskCreateFlow'

describe('taskCreateFlow lead linking', () => {
  const leadNoParcel = { id: 'lead-1', name: 'Jane Doe' }
  const leadWithParcel = { id: 'lead-2', parcelId: 'parcel-2', name: 'John Smith' }
  const leads = [leadNoParcel, leadWithParcel]

  it('resolveTaskContext uses lead id when parcel is missing', () => {
    const ctx = resolveTaskContext({ leadId: 'lead-1', leads })
    expect(ctx.leadId).toBe('lead-1')
    expect(ctx.parcelId).toBe('lead-1')
  })

  it('resolveTaskContext prefers parcel id when present', () => {
    const ctx = resolveTaskContext({ leadId: 'lead-2', leads })
    expect(ctx.parcelId).toBe('parcel-2')
  })

  it('resolveTaskFormIdsFromTask resolves lead stored as parcelId lead id', () => {
    const ids = resolveTaskFormIdsFromTask({ parcelId: 'lead-1', title: 'Call' }, leads, [])
    expect(ids.leadId).toBe('lead-1')
  })

  it('findLeadByTaskKey matches id or parcelId', () => {
    expect(findLeadByTaskKey(leads, 'lead-1')?.id).toBe('lead-1')
    expect(findLeadByTaskKey(leads, 'parcel-2')?.id).toBe('lead-2')
  })
})
