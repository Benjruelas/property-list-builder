// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-mapbox-token')

const {
  useBasemapStyle,
  fetchGoogleTilesSession,
  BASEMAP_SESSION_STORAGE_KEY,
} = await import('../useBasemapStyle')

function BasemapHarness({ mapStyle = 'satellite' }) {
  const { basemapStatus, basemapProvider } = useBasemapStyle(mapStyle)
  return (
    <span data-testid="status">
      {basemapStatus}:{basemapProvider || 'none'}
    </span>
  )
}

function abortError() {
  const err = new Error('Aborted')
  err.name = 'AbortError'
  return err
}

describe('fetchGoogleTilesSession timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aborts a hung session fetch after the timeout', async () => {
    const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(abortError())
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    let caught
    const pending = fetchGoogleTilesSession('satellite', { timeoutMs: 50 }).then(
      (v) => { caught = { ok: true, v } },
      (e) => { caught = { ok: false, e } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    await pending

    expect(caught?.ok).toBe(false)
    expect(caught?.e?.name).toBe('AbortError')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('useBasemapStyle fail-open on session failure', () => {
  beforeEach(() => {
    cleanup()
    sessionStorage.removeItem(BASEMAP_SESSION_STORAGE_KEY)
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-mapbox-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('falls back to Mapbox when the session fetch aborts/times out', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(abortError())))

    render(<BasemapHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready:mapbox')
    })
  })

  it('sets error when session fails and Mapbox token is missing', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))

    render(<BasemapHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error:none')
    })
  })
})
