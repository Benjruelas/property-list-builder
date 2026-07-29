/**
 * @vitest-environment jsdom
 *
 * Regression: photo mode on a parcel that already has a lead must reuse that
 * lead instead of toasting "A lead already exists for this parcel".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const createLeadMock = vi.fn()
const findLeadByParcelIdMock = vi.fn()
const loadLocalLeadsMock = vi.fn(() => [])
const enqueueCaptureMock = vi.fn(async () => ({ jobId: 'job_1' }))
const reassignDraftJobsMock = vi.fn(async () => {})
const getBlobsMock = vi.fn(async () => ({ thumb: new Blob(['x'], { type: 'image/jpeg' }) }))
const showToastMock = vi.fn()

vi.mock('@/utils/leads', async () => {
  const actual = await vi.importActual('@/utils/leads')
  return {
    ...actual,
    createLead: (...args) => createLeadMock(...args),
    findLeadByParcelId: (...args) => findLeadByParcelIdMock(...args),
    loadLocalLeads: (...args) => loadLocalLeadsMock(...args),
  }
})

vi.mock('@/photos/photosClient', async () => {
  const actual = await vi.importActual('@/photos/photosClient')
  return {
    ...actual,
    getCurrentPosition: async () => null,
    sumPhotoBytes: () => 0,
  }
})

vi.mock('../PhotoUploadProvider', () => ({
  usePhotoUpload: () => ({
    enqueueCapture: enqueueCaptureMock,
    reassignDraftJobs: reassignDraftJobsMock,
  }),
  useEntityUploadJobs: () => [],
  PhotoUploadProvider: ({ children }) => children,
}))

vi.mock('../photoStoreIdb', () => ({
  getBlobs: (...args) => getBlobsMock(...args),
}))

vi.mock('../../components/ui/toast', () => ({
  showToast: (...args) => showToastMock(...args),
}))

vi.mock('@/utils/leadActivity', () => ({
  logLeadPhotosAdded: async () => {},
}))

vi.mock('@/utils/modalPortal', () => ({
  getModalPortalContainer: () => document.getElementById('modal-root') || document.body,
}))

import { PhotoCaptureModal } from '@/photos/PhotoCaptureModal'

const existingLead = {
  id: 'lead_existing_1',
  parcelId: 'PARCEL-100',
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: '100 Main St',
  photos: [],
}

const draftEntity = {
  parcelId: 'PARCEL-100',
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: '100 Main St',
  photos: [],
}

async function mountAndUpload(existingLeads) {
  document.body.innerHTML = '<div id="modal-root"></div><div id="root"></div>'
  const container = document.getElementById('root')
  const root = createRoot(container)
  const onLeadCreated = vi.fn()

  await act(async () => {
    root.render(
      <PhotoCaptureModal
        open
        entityType="lead"
        entity={draftEntity}
        parcelId="PARCEL-100"
        getToken={async () => 'token'}
        currentUser={{ uid: 'u1', email: 'u@test.com' }}
        onClose={() => {}}
        onLeadCreated={onLeadCreated}
        existingLeads={existingLeads}
      />,
    )
  })

  const fileInput = document.querySelector('input[type="file"]')
  expect(fileInput).toBeTruthy()

  const file = new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' })
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  return { root, onLeadCreated }
}

describe('PhotoCaptureModal existing-lead reuse', () => {
  beforeEach(() => {
    createLeadMock.mockReset()
    findLeadByParcelIdMock.mockReset()
    loadLocalLeadsMock.mockReset()
    enqueueCaptureMock.mockClear()
    reassignDraftJobsMock.mockClear()
    showToastMock.mockReset()
    findLeadByParcelIdMock.mockReturnValue(existingLead)
    loadLocalLeadsMock.mockReturnValue([])
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reuses an existing lead for the parcel instead of creating a duplicate', async () => {
    const { onLeadCreated } = await mountAndUpload([existingLead])

    expect(createLeadMock).not.toHaveBeenCalled()
    expect(showToastMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/already exists/i),
      expect.anything(),
    )
    expect(onLeadCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lead_existing_1' }),
      expect.objectContaining({ keepOpen: true }),
    )
    expect(enqueueCaptureMock).toHaveBeenCalled()
    const captureRef = enqueueCaptureMock.mock.calls[0][1]
    expect(captureRef).toEqual(expect.objectContaining({
      entityType: 'lead',
      leadId: 'lead_existing_1',
      entityId: 'lead_existing_1',
    }))
  })

  it('falls back to the existing lead when createLead reports a parcel conflict', async () => {
    findLeadByParcelIdMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(existingLead)
    createLeadMock.mockRejectedValueOnce(new Error('A lead already exists for this parcel'))

    const { onLeadCreated } = await mountAndUpload([])

    expect(createLeadMock).toHaveBeenCalled()
    expect(showToastMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/already exists/i),
      expect.anything(),
    )
    expect(onLeadCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lead_existing_1' }),
      expect.objectContaining({ keepOpen: true }),
    )
    expect(enqueueCaptureMock).toHaveBeenCalled()
  })
})
