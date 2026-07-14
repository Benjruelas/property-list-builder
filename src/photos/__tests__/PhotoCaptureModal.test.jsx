/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

vi.mock('../PhotoUploadProvider', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEntityUploadJobs: () => [],
    usePhotoUpload: () => ({
      enqueueCapture: vi.fn(),
      reassignDraftJobs: vi.fn(),
    }),
  }
})

import { PhotoCaptureModal } from '@/photos/PhotoCaptureModal'
import { PhotoUploadProvider } from '@/photos/PhotoUploadProvider'

function mountCaptureModal(entity, extraProps = {}) {
  document.body.innerHTML = '<div id="modal-root"></div><div id="root"></div>'
  const container = document.getElementById('root')
  const root = createRoot(container)

  act(() => {
    root.render(
      <PhotoUploadProvider getToken={async () => 'token'}>
        <PhotoCaptureModal
          open
          entityType="lead"
          entity={entity}
          getToken={async () => 'token'}
          currentUser={{ uid: 'collab_uid', email: 'collab@test.com' }}
          onClose={() => {}}
          {...extraProps}
        />
      </PhotoUploadProvider>,
    )
  })

  return { container, root }
}

describe('PhotoCaptureModal', () => {
  it('mounts for a shared lead opened by a collaborator', () => {
    const sharedLead = {
      id: 'lead_shared_1',
      ownerId: 'owner_uid',
      firstName: 'Jane',
      lastName: 'Doe',
      visibility: 'members',
      photos: [],
      photoCount: 0,
    }

    const { container } = mountCaptureModal(sharedLead)
    const popover = document.querySelector('.photo-add-popover') || container.querySelector('.photo-add-popover')
    expect(popover).not.toBeNull()
  })

  it('does not mount deal capture without a deal id', () => {
    mountCaptureModal({ title: 'Roof job' }, { entityType: 'deal', pipelineId: 'pipe_1' })
    expect(document.querySelector('.photo-add-popover')).toBeNull()
  })
})
