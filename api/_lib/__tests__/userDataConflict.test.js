/**
 * Simulates the __baseVersion conflict branch of api/user-data.js.
 * (Full handler needs Firebase/KV; this unit-tests the conflict decision logic.)
 */
import { describe, expect, it } from 'vitest'

function applyMergeLogic({ existing, body }) {
  const currentVersion = Number(existing.__version) || 0
  if (body.__baseVersion !== undefined && body.__baseVersion !== null && body.__baseVersion !== '') {
    const clientBase = Number(body.__baseVersion)
    if (Number.isFinite(clientBase) && clientBase !== currentVersion) {
      return { conflict: true, currentVersion, data: existing }
    }
  }
  const merged = { ...existing }
  for (const [key, value] of Object.entries(body)) {
    if (key === '__baseVersion') continue
    merged[key] = value
  }
  merged.__version = currentVersion + 1
  return { conflict: false, currentVersion: merged.__version, data: merged }
}

describe('user-data __baseVersion conflict', () => {
  it('returns conflict when client base lags server', () => {
    const result = applyMergeLogic({
      existing: { __version: 5, parcelNotes: { a: 'server' } },
      body: { __baseVersion: 3, parcelNotes: { a: 'local' } },
    })
    expect(result.conflict).toBe(true)
    expect(result.currentVersion).toBe(5)
    expect(result.data.parcelNotes.a).toBe('server')
  })

  it('applies merge when versions match', () => {
    const result = applyMergeLogic({
      existing: { __version: 5, parcelNotes: { a: 'old' } },
      body: { __baseVersion: 5, parcelNotes: { a: 'new' } },
    })
    expect(result.conflict).toBe(false)
    expect(result.currentVersion).toBe(6)
    expect(result.data.parcelNotes.a).toBe('new')
  })

  it('allows writes without __baseVersion (legacy clients)', () => {
    const result = applyMergeLogic({
      existing: { __version: 2 },
      body: { appSettings: { theme: 'dark' } },
    })
    expect(result.conflict).toBe(false)
    expect(result.data.appSettings.theme).toBe('dark')
  })
})
