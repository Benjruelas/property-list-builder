import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../leadAccess.js', () => ({
  getLeadWithAccess: vi.fn(),
  getVisibleLeads: vi.fn(),
  canEditLead: (access) =>
    access === 'owner' || access === 'admin' || access === 'admin_view' || access === 'collaborator',
}))

vi.mock('../teams.js', () => ({
  getAllTeams: vi.fn(async () => []),
}))

vi.mock('../pipelineRepo.js', () => ({
  findPipelineById: vi.fn(),
  getPipelinesForUser: vi.fn(),
}))

vi.mock('../resourceContext.js', async () => {
  const actual = await vi.importActual('../resourceContext.js')
  return {
    ...actual,
    buildAccessContext: vi.fn(() => ({ team: null, teamsIndex: {} })),
    getResourceAccess: vi.fn(),
  }
})

import { getLeadWithAccess, getVisibleLeads } from '../leadAccess.js'
import { findPipelineById, getPipelinesForUser } from '../pipelineRepo.js'
import { getResourceAccess } from '../resourceContext.js'
import {
  canAccessLeadLinkedResource,
  canMutateLeadLinkedResource,
  filterVisibleLeadLinkedResources,
} from '../leadLinkedAccess.js'

describe('leadLinkedAccess', () => {
  const owner = { uid: 'owner1', email: 'owner@test.com' }
  const collab = { uid: 'collab1', email: 'collab@test.com' }
  const stranger = { uid: 'stranger', email: 'stranger@test.com' }

  beforeEach(() => {
    vi.mocked(getLeadWithAccess).mockReset()
    vi.mocked(getVisibleLeads).mockReset()
    vi.mocked(findPipelineById).mockReset()
    vi.mocked(getPipelinesForUser).mockReset()
    vi.mocked(getResourceAccess).mockReset()
  })

  it('allows the resource owner to access and mutate without lead lookup', async () => {
    const report = { id: 'r1', ownerId: 'owner1', leadId: 'lead1' }
    await expect(canAccessLeadLinkedResource(owner, report)).resolves.toBe(true)
    await expect(canMutateLeadLinkedResource(owner, report)).resolves.toBe(true)
    expect(getLeadWithAccess).not.toHaveBeenCalled()
  })

  it('allows a lead collaborator to access and mutate a teammate report', async () => {
    const report = { id: 'r1', ownerId: 'owner1', leadId: 'lead1' }
    getLeadWithAccess.mockResolvedValue({ lead: { id: 'lead1' }, access: 'collaborator' })

    await expect(canAccessLeadLinkedResource(collab, report)).resolves.toBe(true)
    await expect(canMutateLeadLinkedResource(collab, report)).resolves.toBe(true)
    expect(getLeadWithAccess).toHaveBeenCalledWith(collab, 'lead1')
  })

  it('denies users without lead or ownership access', async () => {
    const report = { id: 'r1', ownerId: 'owner1', leadId: 'lead1' }
    getLeadWithAccess.mockResolvedValue({ lead: null, access: null })

    await expect(canAccessLeadLinkedResource(stranger, report)).resolves.toBe(false)
    await expect(canMutateLeadLinkedResource(stranger, report)).resolves.toBe(false)
  })

  it('allows mutate via editable pipeline when quote has no leadId', async () => {
    const quote = { id: 'q1', ownerId: 'owner1', pipelineId: 'pipe1' }
    findPipelineById.mockResolvedValue({ id: 'pipe1', ownerId: 'owner1' })
    getResourceAccess.mockReturnValue('collaborator')

    await expect(canAccessLeadLinkedResource(collab, quote)).resolves.toBe(true)
    await expect(canMutateLeadLinkedResource(collab, quote)).resolves.toBe(true)
  })

  it('filters list to owned + lead-visible + pipeline-visible resources', async () => {
    getVisibleLeads.mockResolvedValue([{ id: 'lead1' }])
    getPipelinesForUser.mockResolvedValue([{ id: 'pipe1' }])

    const all = [
      { id: 'a', ownerId: 'collab1', leadId: 'leadX' },
      { id: 'b', ownerId: 'owner1', leadId: 'lead1' },
      { id: 'c', ownerId: 'owner1', leadId: 'leadHidden' },
      { id: 'd', ownerId: 'owner1', pipelineId: 'pipe1' },
      { id: 'e', ownerId: 'owner1', pipelineId: 'pipeHidden' },
    ]

    const visible = await filterVisibleLeadLinkedResources(collab, all)
    expect(visible.map((r) => r.id).sort()).toEqual(['a', 'b', 'd'])
  })
})
