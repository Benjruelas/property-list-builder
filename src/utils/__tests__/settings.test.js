import { describe, expect, it, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeParcelBoundaryColor,
  updateSettings,
  consumeSettingsMigrationPending,
} from '../settings'

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

describe('normalizeParcelBoundaryColor', () => {
  it('replaces deprecated white values with the default blue', () => {
    expect(normalizeParcelBoundaryColor('#ffffff')).toBe('#2563eb')
    expect(normalizeParcelBoundaryColor('#FFFFFF')).toBe('#2563eb')
    expect(normalizeParcelBoundaryColor('#fff')).toBe('#2563eb')
    expect(normalizeParcelBoundaryColor('white')).toBe('#2563eb')
  })

  it('keeps supported parcel colors unchanged', () => {
    expect(normalizeParcelBoundaryColor('#ef4444')).toBe('#ef4444')
    expect(normalizeParcelBoundaryColor('#2563eb')).toBe('#2563eb')
  })
})

describe('getSettings parcel color migration', () => {
  beforeEach(() => {
    localStorage.clear()
    consumeSettingsMigrationPending()
  })

  it('migrates stored white parcel colors to the default', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ parcelBoundaryColor: '#ffffff' }))
    const settings = getSettings()
    expect(settings.parcelBoundaryColor).toBe(DEFAULT_SETTINGS.parcelBoundaryColor)
    expect(JSON.parse(localStorage.getItem(LS_KEY)).parcelBoundaryColor).toBe(DEFAULT_SETTINGS.parcelBoundaryColor)
    expect(consumeSettingsMigrationPending()).toBe(true)
  })

  it('blocks saving white through updateSettings', () => {
    updateSettings({ parcelBoundaryColor: '#ffffff' })
    expect(getSettings().parcelBoundaryColor).toBe(DEFAULT_SETTINGS.parcelBoundaryColor)
  })
})
