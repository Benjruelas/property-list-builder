import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../leadAccess.js', () => ({
  getLeadWithAccess: vi.fn(),
}))

import { getLeadWithAccess } from '../leadAccess.js'
import { canViewFormSubmission, canDeleteFormSubmission } from '../formSubmissionAccess.js'

const ctx = { team: null, teamsIndex: {} }
const templateById = new Map([
  ['tpl_private', {
    id: 'tpl_private',
    ownerId: 'owner1',
    ownerEmail: 'owner@test.com',
    visibility: 'private',
  }],
])

describe('formSubmissionAccess', () => {
  beforeEach(() => {
    vi.mocked(getLeadWithAccess).mockReset()
  })

  it('allows template owner to view and delete', async () => {
    const sub = { templateId: 'tpl_private', leadId: 'lead1' }
    const user = { uid: 'owner1', email: 'owner@test.com' }
    await expect(canViewFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
    await expect(canDeleteFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
    expect(getLeadWithAccess).not.toHaveBeenCalled()
  })

  it('allows lead collaborator without template access to view and delete', async () => {
    const sub = { templateId: 'tpl_private', leadId: 'lead1' }
    const user = { uid: 'collab1', email: 'collab@test.com' }
    getLeadWithAccess.mockResolvedValue({ lead: { id: 'lead1' }, access: 'collaborator' })

    await expect(canViewFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
    await expect(canDeleteFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
    expect(getLeadWithAccess).toHaveBeenCalledWith(user, 'lead1')
  })

  it('denies unrelated user without template or lead access', async () => {
    const sub = { templateId: 'tpl_private', leadId: 'lead1' }
    const user = { uid: 'stranger', email: 'stranger@test.com' }
    getLeadWithAccess.mockResolvedValue({ lead: null, access: null })

    await expect(canViewFormSubmission(sub, user, ctx, templateById)).resolves.toBe(false)
    await expect(canDeleteFormSubmission(sub, user, ctx, templateById)).resolves.toBe(false)
  })

  it('allows team admin_view on lead to view and delete when template is private', async () => {
    const sub = { templateId: 'tpl_private', leadId: 'lead1' }
    const user = { uid: 'viewer', email: 'viewer@test.com' }
    getLeadWithAccess.mockResolvedValue({ lead: { id: 'lead1' }, access: 'admin_view' })

    await expect(canViewFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
    await expect(canDeleteFormSubmission(sub, user, ctx, templateById)).resolves.toBe(true)
  })
})
