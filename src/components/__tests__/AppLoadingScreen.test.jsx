/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logoSplashPlayback', async () => {
  const actual = await vi.importActual('@/utils/logoSplashPlayback')
  return {
    ...actual,
    LOGO_SPLASH_ANIM_MS: 1000,
    scheduleLogoSplashComplete: (onDone, ms = 1000) => {
      const t = window.setTimeout(() => onDone(true), ms)
      return () => window.clearTimeout(t)
    },
  }
})

import { AppLoadingScreen } from '../AppLoadingScreen'

function mountBootLoader() {
  const boot = document.createElement('div')
  boot.id = 'initial-loader'
  boot.innerHTML = '<img class="boot-logo-anim" alt="" />'
  document.body.appendChild(boot)
  window.__bootSplashOwnedByReact = false
  window.__bootSplashOwnerGen = 0
  window.__removeInitialLoader = () => boot.remove()
  return boot
}

describe('AppLoadingScreen boot ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    document.body.innerHTML = ''
    const modal = document.createElement('div')
    modal.id = 'modal-root'
    document.body.appendChild(modal)
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete window.__bootSplashOwnedByReact
    delete window.__bootSplashOwnerGen
    delete window.__removeInitialLoader
  })

  it('removes the HTML boot splash when unmounted before play completes', async () => {
    mountBootLoader()
    const { unmount } = render(<AppLoadingScreen active message="Loading report" />)

    expect(document.getElementById('initial-loader')).toBeTruthy()
    expect(window.__bootSplashOwnedByReact).toBe(true)
    expect(window.__removeInitialLoader).toBeNull()

    unmount()

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.getElementById('initial-loader')).toBeNull()
    expect(window.__bootSplashOwnedByReact).toBe(false)
  })

  it('does not tear down the boot splash when Strict Mode remounts reclaim it', async () => {
    mountBootLoader()
    const first = render(<AppLoadingScreen active message="Loading report" />)
    const genAfterFirst = window.__bootSplashOwnerGen
    expect(genAfterFirst).toBeGreaterThan(0)

    first.unmount()
    // Remount before the deferred release microtask runs (simulates Strict Mode).
    render(<AppLoadingScreen active message="Loading report" />)
    expect(window.__bootSplashOwnerGen).toBeGreaterThan(genAfterFirst)

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.getElementById('initial-loader')).toBeTruthy()
    expect(window.__bootSplashOwnedByReact).toBe(true)
  })

  it('dismisses the boot splash after the logo duration when deactivated', async () => {
    mountBootLoader()
    const { rerender } = render(<AppLoadingScreen active message="Loading report" />)

    rerender(<AppLoadingScreen active={false} message="Loading report" />)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(document.getElementById('initial-loader')).toBeNull()
    })
    expect(window.__bootSplashOwnedByReact).toBe(false)
  })
})
