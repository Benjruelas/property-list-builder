/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const resolveLeadParcelAtLocationMock = vi.fn()
const getCurrentPositionWithFallbackMock = vi.fn()

vi.mock('@/utils/resolveLeadParcel', () => ({
  resolveLeadParcelAtLocation: (...args) => resolveLeadParcelAtLocationMock(...args),
}))

vi.mock('@/utils/geolocation', () => ({
  getCurrentPositionWithFallback: (...args) => getCurrentPositionWithFallbackMock(...args),
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

const existingLead = {
  id: 'lead_1',
  parcelId: 'P-1',
  firstName: 'Pat',
  lastName: 'Owner',
  address: '1 Oak St',
}

async function mountDialog({ leads, onConfirm }) {
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
      />,
    )
  })
  // Allow locate + resolve effects to settle.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return root
}

describe('QuickPhotoModeDialog existing parcel lead', () => {
  beforeEach(() => {
    resolveLeadParcelAtLocationMock.mockReset()
    getCurrentPositionWithFallbackMock.mockReset()
    getCurrentPositionWithFallbackMock.mockResolvedValue({
      coords: { latitude: 32.78, longitude: -96.8 },
    })
    resolveLeadParcelAtLocationMock.mockResolvedValue({
      id: 'P-1',
      parcelId: 'P-1',
      address: '1 Oak St',
      lat: 32.78,
      lng: -96.8,
      properties: { OWNER_NAME: 'Pat Owner', PROP_ID: 'P-1' },
    })
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
})
