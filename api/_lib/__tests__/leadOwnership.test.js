import { describe, it, expect } from 'vitest'
import {
  isLeadOwner,
  userCapturedAllPhotos,
  withRepairedLeadOwnership,
} from '../leadOwnership.js'

describe('leadOwnership', () => {
  const user = { uid: 'user-1', email: 'owner@example.com' }

  it('matches owner ids with string coercion', () => {
    const lead = { ownerId: 1, ownerEmail: 'owner@example.com' }
    expect(isLeadOwner({ uid: '1', email: 'owner@example.com' }, lead)).toBe(true)
  })

  it('detects when every photo was captured by the user', () => {
    const lead = {
      photos: [
        { capturedByUid: 'user-1' },
        { capturedByUid: 'user-1' },
      ],
    }
    expect(userCapturedAllPhotos(user, lead)).toBe(true)
  })

  it('repairs missing ownerId when user captured all photos', () => {
    const lead = {
      photos: [{ capturedByUid: 'user-1' }],
    }
    const repaired = withRepairedLeadOwnership(lead, user)
    expect(repaired.ownerId).toBe('user-1')
    expect(repaired.ownerEmail).toBe('owner@example.com')
  })
})
