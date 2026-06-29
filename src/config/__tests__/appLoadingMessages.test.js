import { describe, it, expect } from 'vitest'
import { getAppLoadingMessage, getAppLoadingRoute, APP_LOADING_MESSAGES } from '../appLoadingMessages'

describe('appLoadingMessages', () => {
  it('detects public routes from query params', () => {
    expect(getAppLoadingRoute('?quote=abc')).toBe('quote')
    expect(getAppLoadingRoute('?report=xyz')).toBe('report')
    expect(getAppLoadingRoute('?form=tok')).toBe('form')
    expect(getAppLoadingRoute('')).toBe('map')
  })

  it('returns route-specific messages', () => {
    expect(getAppLoadingMessage({ route: 'quote' })).toBe(APP_LOADING_MESSAGES.quote)
    expect(getAppLoadingMessage({ route: 'report' })).toBe(APP_LOADING_MESSAGES.report)
    expect(getAppLoadingMessage({ route: 'form' })).toBe(APP_LOADING_MESSAGES.form)
  })

  it('prefers basemap then auth messages on map route', () => {
    expect(getAppLoadingMessage({ route: 'map', basemapLoading: true })).toBe(APP_LOADING_MESSAGES.mapBasemap)
    expect(getAppLoadingMessage({ route: 'map', authLoading: true })).toBe(APP_LOADING_MESSAGES.mapAuth)
    expect(getAppLoadingMessage({ route: 'map' })).toBe(APP_LOADING_MESSAGES.mapAuth)
  })
})
