/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const resolveLeadParcelAtLocationMock = vi.fn()
const getCurrentPositionWithFallbackMock = vi.fn()
const getUserLocationMock = vi.fn()

vi.mock('@/utils/resolveLeadParcel', () => ({
  resolveLeadParcelAtLocation: (...args) => resolveLeadParcelAtLocationMock(...args),
}))

vi.mock('@/utils/geolocation', () => ({
  getCurrentPositionWithFallback: (...args) => getCurrentPositionWithFallbackMock(...args),
}))

vi.mock('@/utils/locationStore', () => ({
  getUserLocation: (...args) => getUserLocationMock(...args),
}))

vi.mock('@/utils/geocodeAddress', () => ({
  geocodeAddressForLead: vi.fn(),
}))

vi.mock('@/utils/reverseGeocode', () => ({
  reverseGeocodeCity: vi.fn(async () => ''),
}))

vi.mock('../../ui/toast', () => ({
  showToast: vi.fn(),
}))

import { QuickPhotoModeDialog } from '../QuickPhotoModeDialog'
import { geocodeAddressForLead } from '@/utils/geocodeAddress'
import { showToast } from '../../ui/toast'

const existingLead = {
  id: 'lead_1',
  parcelId: 'P-1',
  firstName: 'Pat',
  lastName: 'Owner',
  address: '1 Oak St',
}

const parcelFixture = {
  id: 'P-1',
  parcelId: 'P-1',
  address: '1 Oak St',
  lat: 32.78,
  lng: -96.8,
  properties: { OWNER_NAME: 'Pat Owner', PROP_ID: 'P-1' },
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function mountDialog({ leads, onConfirm, onResolveParcel }) {
  document.body.innerHTML = '<div id="modal-root"></div><div id="root"></div>'
  const container = document.getElementById('root')
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <QuickPhotoModeDialog
        open
        onClose={() => {}}
        leads={leads}
        onConfirm={onConfirm}
        onResolveParcel={onResolveParcel}
      />,
    )
  })
  await flush()
  return root
}

describe('QuickPhotoModeDialog existing parcel lead', () => {
  beforeEach(() => {
    resolveLeadParcelAtLocationMock.mockReset()
    getCurrentPositionWithFallbackMock.mockReset()
    getUserLocationMock.mockReset()
    getUserLocationMock.mockReturnValue(null)
    getCurrentPositionWithFallbackMock.mockResolvedValue({
      coords: { latitude: 32.78, longitude: -96.8 },
    })
    resolveLeadParcelAtLocationMock.mockResolvedValue(parcelFixture)
    geocodeAddressForLead.mockReset()
    showToast.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('confirms with the existing lead when the parcel is already connected', async () => {
    const onConfirm = vi.fn()
    await mountDialog({ leads: [existingLead], onConfirm })

    const startBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Use this lead/i.test(b.textContent || ''),
    )
    expect(startBtn).toBeTruthy()

    await act(async () => {
      startBtn.click()
    })

    expect(onConfirm).toHaveBeenCalledWith({ lead: expect.objectContaining({ id: 'lead_1' }) })
  })

  it('uses onResolveParcel (map tile lrid path) instead of bare coordinate lookup', async () => {
    const onResolveParcel = vi.fn().mockResolvedValue(parcelFixture)
    await mountDialog({ leads: [], onConfirm: vi.fn(), onResolveParcel })

    expect(onResolveParcel).toHaveBeenCalledWith(32.78, -96.8)
    expect(resolveLeadParcelAtLocationMock).not.toHaveBeenCalled()
    expect(
      Array.from(document.querySelectorAll('button')).some((b) =>
        /Start taking photos/i.test(b.textContent || ''),
      ),
    ).toBe(true)
  })

  it('falls back to the map blue-dot location when fresh GPS fails', async () => {
    getCurrentPositionWithFallbackMock.mockRejectedValue(new Error('GPS timeout'))
    getUserLocationMock.mockReturnValue({ lat: 32.781, lng: -96.801 })
    const onResolveParcel = vi.fn().mockResolvedValue({
      ...parcelFixture,
      lat: 32.781,
      lng: -96.801,
    })

    await mountDialog({ leads: [], onConfirm: vi.fn(), onResolveParcel })

    expect(onResolveParcel).toHaveBeenCalledWith(32.781, -96.801)
    expect(
      Array.from(document.querySelectorAll('button')).some((b) =>
        /Start taking photos/i.test(b.textContent || ''),
      ),
    ).toBe(true)
  })

  it('retries map blue-dot coords when GPS coords miss a parcel', async () => {
    getUserLocationMock.mockReturnValue({ lat: 32.79, lng: -96.81 })
    const onResolveParcel = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(parcelFixture)

    await mountDialog({ leads: [], onConfirm: vi.fn(), onResolveParcel })

    expect(onResolveParcel).toHaveBeenNthCalledWith(1, 32.78, -96.8)
    expect(onResolveParcel).toHaveBeenNthCalledWith(2, 32.79, -96.81)
    expect(
      Array.from(document.querySelectorAll('button')).some((b) =>
        /Start taking photos/i.test(b.textContent || ''),
      ),
    ).toBe(true)
  })
})

describe('QuickPhotoModeDialog manual address', () => {
  beforeEach(() => {
    resolveLeadParcelAtLocationMock.mockReset()
    getCurrentPositionWithFallbackMock.mockReset()
    getUserLocationMock.mockReset()
    getUserLocationMock.mockReturnValue(null)
    getCurrentPositionWithFallbackMock.mockRejectedValue(new Error('GPS denied'))
    geocodeAddressForLead.mockReset()
    showToast.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves parcel after Use this address geocodes successfully', async () => {
    geocodeAddressForLead.mockResolvedValue({
      lat: 33.1,
      lng: -97.2,
      address: '100 Main St, Dallas, TX',
    })
    const onResolveParcel = vi.fn().mockResolvedValue(parcelFixture)
    const onConfirm = vi.fn()

    document.body.innerHTML = '<div id="modal-root"></div><div id="root"></div>'
    const root = createRoot(document.getElementById('root'))

    await act(async () => {
      root.render(
        <QuickPhotoModeDialog
          open
          onClose={() => {}}
          leads={[]}
          onConfirm={onConfirm}
          onResolveParcel={onResolveParcel}
        />,
      )
    })
    await flush()

    const input = document.querySelector('input')
    expect(input).toBeTruthy()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '100 Main St')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const useBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Use this address/i.test(b.textContent || ''),
    )
    expect(useBtn).toBeTruthy()
    expect(useBtn.disabled).toBe(false)

    await act(async () => {
      useBtn.click()
    })
    await flush()

    expect(geocodeAddressForLead).toHaveBeenCalledWith('100 Main St')
    expect(onResolveParcel).toHaveBeenCalledWith(33.1, -97.2)
    expect(
      Array.from(document.querySelectorAll('button')).some((b) =>
        /Start taking photos/i.test(b.textContent || ''),
      ),
    ).toBe(true)
  })
})
