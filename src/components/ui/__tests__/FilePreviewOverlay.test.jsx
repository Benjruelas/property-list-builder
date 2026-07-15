/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePreviewOverlay } from '../FilePreviewOverlay'

describe('FilePreviewOverlay loading state', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>'
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips the loading preview UI when the image blob is cached', () => {
    const cachedBlob = new Blob(['cached'], { type: 'image/jpeg' })
    const loadBlob = vi.fn()

    render(
      <FilePreviewOverlay
        open
        onClose={() => {}}
        items={[{
          id: 'photo-1',
          name: 'Photo 1',
          contentType: 'image/jpeg',
          getCachedBlob: () => cachedBlob,
          loadBlob,
        }]}
      />,
    )

    expect(screen.queryByText('Loading preview…')).toBeNull()
    expect(screen.getByAltText('Photo 1').getAttribute('src')).toBe('blob:preview')
    expect(loadBlob).not.toHaveBeenCalled()
  })

  it('keeps the loading preview UI for an image that must be fetched', async () => {
    let resolveBlob
    const loadBlob = vi.fn(() => new Promise((resolve) => {
      resolveBlob = resolve
    }))

    render(
      <FilePreviewOverlay
        open
        onClose={() => {}}
        items={[{
          id: 'photo-1',
          name: 'Photo 1',
          contentType: 'image/jpeg',
          getCachedBlob: () => null,
          loadBlob,
        }]}
      />,
    )

    expect(screen.getByText('Loading preview…')).toBeTruthy()

    await act(async () => {
      resolveBlob(new Blob(['loaded'], { type: 'image/jpeg' }))
    })

    expect(screen.queryByText('Loading preview…')).toBeNull()
    expect(screen.getByAltText('Photo 1')).toBeTruthy()
  })
})
