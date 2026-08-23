import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticate = vi.fn()
const getAllTeams = vi.fn()
const loadUserAppSettings = vi.fn()
const getLeadsForUser = vi.fn()
const getAllLeads = vi.fn()
const mutateLeads = vi.fn()
const rateLimit = vi.fn()
const logTeamActivity = vi.fn()
const loadTagRegistry = vi.fn()
const createTasksFromAutoTaskPlan = vi.fn()

vi.mock('../auth.js', () => ({ authenticate: (...args) => authenticate(...args) }))
vi.mock('../teams.js', async () => {
  const actual = await vi.importActual('../teams.js')
  return {
    ...actual,
    getAllTeams: (...args) => getAllTeams(...args),
  }
})
vi.mock('../normalizeLeadInput.js', async () => {
  const actual = await vi.importActual('../normalizeLeadInput.js')
  return {
    ...actual,
    loadUserAppSettings: (...args) => loadUserAppSettings(...args),
  }
})
vi.mock('../leadRepo.js', () => ({ getLeadsForUser: (...args) => getLeadsForUser(...args) }))
vi.mock('../leadStore.js', () => ({
  getAllLeads: (...args) => getAllLeads(...args),
  mutateLeads: (...args) => mutateLeads(...args),
}))
vi.mock('../rateLimit.js', () => ({
  rateLimit: (...args) => rateLimit(...args),
  default: (...args) => rateLimit(...args),
}))
vi.mock('../activityLog.js', () => ({
  logTeamActivity: (...args) => logTeamActivity(...args),
  actorLabel: (user) => user?.email?.split('@')[0] || 'Someone',
  teamIdsFromResource: () => [],
}))
vi.mock('../tagHelpers.js', async () => {
  const actual = await vi.importActual('../tagHelpers.js')
  return {
    ...actual,
    loadTagRegistry: (...args) => loadTagRegistry(...args),
    syncTagMetaToCollaborators: vi.fn(),
    adoptTagMetaIntoUserRegistry: vi.fn(),
  }
})
vi.mock('../createStatusAutoTasks.js', () => ({
  createTasksFromAutoTaskPlan: (...args) => createTasksFromAutoTaskPlan(...args),
}))
vi.mock('../kvBootstrap.js', () => ({ kv: null, kvAvailable: false }))
vi.mock('../kvLockErrors.js', () => ({
  isKvLockUnavailable: () => false,
  respondKvLockUnavailable: (res) => res.status(503).json({ error: 'locked' }),
}))

import handler from '../../leads-import.js'

function mockRes() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    end() { return this },
  }
  return res
}

describe('POST /api/leads-import', () => {
  beforeEach(() => {
    authenticate.mockReset().mockResolvedValue({ user: { uid: 'u1', email: 'owner@example.com' } })
    getAllTeams.mockReset().mockResolvedValue([])
    loadUserAppSettings.mockReset().mockResolvedValue(null)
    getLeadsForUser.mockReset().mockResolvedValue([])
    getAllLeads.mockReset().mockResolvedValue([])
    mutateLeads.mockReset().mockImplementation(async (fn) => fn([]))
    rateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 })
    logTeamActivity.mockReset().mockResolvedValue([])
    loadTagRegistry.mockReset().mockResolvedValue({ leads: [] })
    createTasksFromAutoTaskPlan.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    authenticate.mockResolvedValue({ user: null })
    const res = mockRes()
    await handler({ method: 'POST', body: { leads: [{ firstName: 'Ada' }] }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects an empty body and batches over 50', async () => {
    const empty = mockRes()
    await handler({ method: 'POST', body: { leads: [] }, headers: {} }, empty)
    expect(empty.statusCode).toBe(400)

    const tooMany = mockRes()
    await handler({
      method: 'POST',
      body: { leads: Array.from({ length: 51 }, () => ({ firstName: 'Ada' })) },
      headers: {},
    }, tooMany)
    expect(tooMany.statusCode).toBe(400)
    expect(tooMany.body.error).toMatch(/50/)
  })

  it('creates valid rows, reports invalid ones, and writes once without auto-tasks', async () => {
    const res = mockRes()
    await handler({
      method: 'POST',
      headers: {},
      body: {
        leads: [
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
          { notes: 'missing name' },
        ],
      },
    }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.created).toHaveLength(1)
    expect(res.body.errors).toHaveLength(1)
    expect(mutateLeads).toHaveBeenCalledTimes(1)
    expect(createTasksFromAutoTaskPlan).not.toHaveBeenCalled()
  })
})
