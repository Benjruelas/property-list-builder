// @vitest-environment jsdom

import React, { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requestPermission = vi.fn()
vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
const { useDeviceHeading } = await import('../useDeviceHeading')

function HeadingHarness({ confirmed }) {
  const { confirmOrientationGranted, needsGesture } = useDeviceHeading(true)
  useEffect(() => {
    if (confirmed) confirmOrientationGranted()
  }, [confirmed, confirmOrientationGranted])
  return <span>{needsGesture ? 'gesture-needed' : 'listening'}</span>
}

describe('useDeviceHeading permission synchronization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    requestPermission.mockReset()
  })

  it('starts listening after onboarding already granted orientation', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    render(<HeadingHarness confirmed />)

    await waitFor(() => expect(screen.getByText('listening')).toBeTruthy())
    expect(requestPermission).not.toHaveBeenCalled()
    expect(addEventListener).toHaveBeenCalledWith(
      expect.stringMatching(/^deviceorientation/),
      expect.any(Function),
      { passive: true }
    )
  })
})
