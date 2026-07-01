import { describe, it, expect } from 'vitest'
import {
  canEditPipeline,
  canMutateDealPhotos,
} from '../pipelineAccess.js'

describe('pipelineAccess', () => {
  const pipeline = { id: 'pipe_1', ownerId: 'owner_1', visibility: 'members', sharedMemberUids: ['collab_1'] }
  const user = { uid: 'collab_1', email: 'collab@test.com' }

  it('allows collaborators to mutate deal photos', () => {
    expect(canEditPipeline('collaborator')).toBe(true)
    expect(canMutateDealPhotos(user, pipeline, 'collaborator')).toBe(true)
  })

  it('blocks admin_view from mutating deal photos', () => {
    expect(canEditPipeline('admin_view')).toBe(false)
    expect(canMutateDealPhotos(user, pipeline, 'admin_view')).toBe(false)
  })

  it('allows photo capturer to mutate their own photo', () => {
    const photo = { capturedByUid: 'collab_1' }
    expect(canMutateDealPhotos(user, pipeline, null, photo)).toBe(true)
  })
})
