import { describe, expect, it, beforeEach } from 'vitest'
import { getProfileDisplayName, getSenderDisplayName, toActivityActor } from '../profile'
import { updateSettings } from '../settings'

const LS_KEY = 'app_settings'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('profile display name helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('prefers Settings Your name over Firebase displayName', () => {
    updateSettings({ profile: { displayName: 'Alex Rivera' } })
    const user = { uid: 'u1', email: 'alex@example.com', displayName: 'Old Name' }
    expect(getProfileDisplayName(user)).toBe('Alex Rivera')
    expect(getSenderDisplayName(user)).toBe('Alex Rivera')
    expect(toActivityActor(user)).toEqual({
      uid: 'u1',
      email: 'alex@example.com',
      displayName: 'Alex Rivera',
    })
  })

  it('falls back to auth displayName then email for sender label', () => {
    const user = { uid: 'u2', email: 'sam@example.com', displayName: 'Sam Lee' }
    expect(getProfileDisplayName(user)).toBe('Sam Lee')
    expect(getSenderDisplayName({ uid: 'u3', email: 'jordan@example.com' })).toBe('jordan')
  })

  it('toActivityActor omits displayName when none is set', () => {
    expect(toActivityActor({ uid: 'u4', email: 'x@example.com' })).toEqual({
      uid: 'u4',
      email: 'x@example.com',
    })
  })
})
