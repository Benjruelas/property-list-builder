// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestLocationAccess = vi.hoisted(() => vi.fn())
vi.mock('../../utils/geolocation', () => ({ requestLocationAccess }))

import {
  PermissionPrompt,
  hasCompletedPermissionOnboarding,
} from '../PermissionPrompt'

describe('PermissionPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    requestLocationAccess.mockResolvedValue({
      state: 'denied',
      position: null,
    })
  })

  it('recognizes both current and legacy onboarding persistence', () => {
    expect(hasCompletedPermissionOnboarding()).toBe(false)
    localStorage.setItem('permissions_granted', '1')
    expect(hasCompletedPermissionOnboarding()).toBe(true)
    localStorage.clear()
    localStorage.setItem('location_permission_onboarding_complete', '1')
    expect(hasCompletedPermissionOnboarding()).toBe(true)
  })

  it('completes onboarding when orientation and location are denied', async () => {
    const requestOrientation = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: requestOrientation })
    const onComplete = vi.fn()

    render(<PermissionPrompt onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
      orientationGranted: false,
      locationState: 'denied',
      position: null,
    }))
    expect(requestOrientation).toHaveBeenCalledOnce()
    expect(requestLocationAccess).toHaveBeenCalledOnce()
    expect(localStorage.getItem('location_permission_onboarding_complete')).toBe('1')
  })
})
