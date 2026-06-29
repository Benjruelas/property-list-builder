import { describe, it, expect } from 'vitest'
import { entityKey, parseEntityKey, apiBodyFromRef, isDraftRef } from '@/photos/entityRef'
import { updatePhotoInList } from '@/photos/annotationSave'
import { JOB_STATUS } from '@/photos/PhotoUploadManager'

describe('photo entityRef', () => {
  it('entityKey encodes lead and deal refs', () => {
    expect(entityKey({ entityType: 'lead', leadId: 'l1' })).toBe('lead:l1')
    expect(entityKey({ entityType: 'deal', pipelineId: 'p1', dealId: 'd1' })).toBe('deal:p1:d1')
  })

  it('parseEntityKey reverses lead keys', () => {
    expect(parseEntityKey('lead:l1')).toEqual({
      entityType: 'lead',
      leadId: 'l1',
      entityId: 'l1',
    })
  })

  it('apiBodyFromRef builds API payloads', () => {
    expect(apiBodyFromRef({ entityType: 'lead', leadId: 'l1' })).toEqual({
      entityType: 'lead',
      leadId: 'l1',
    })
    expect(apiBodyFromRef({ entityType: 'deal', pipelineId: 'p1', dealId: 'd1' })).toEqual({
      entityType: 'deal',
      pipelineId: 'p1',
      dealId: 'd1',
    })
  })

  it('isDraftRef detects draft session ids', () => {
    expect(isDraftRef({ leadId: 'draft:abc' })).toBe(true)
    expect(isDraftRef({ leadId: 'lead_1' })).toBe(false)
  })
})

describe('annotationSave helpers', () => {
  it('updatePhotoInList replaces matching photo', () => {
    const list = [{ id: 'a' }, { id: 'b' }]
    const next = updatePhotoInList(list, 'b', { id: 'b', annotatedKey: 'k' })
    expect(next[1].annotatedKey).toBe('k')
  })
})

describe('PhotoUploadManager job statuses', () => {
  it('defines expected lifecycle statuses', () => {
    expect(JOB_STATUS.queued).toBe('queued')
    expect(JOB_STATUS.uploading).toBe('uploading')
    expect(JOB_STATUS.done).toBe('done')
    expect(JOB_STATUS.failed).toBe('failed')
  })
})
