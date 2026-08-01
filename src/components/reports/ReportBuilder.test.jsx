/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportBuilder } from './ReportBuilder'

vi.mock('@/utils/leads', () => ({
  displayLeadName: (lead) => [lead?.firstName, lead?.lastName].filter(Boolean).join(' '),
  formatLeadAddress: (lead) => lead?.address || '',
  fetchLeadById: vi.fn(),
  leadNeedsPhotoHydrate: () => false,
}))

vi.mock('@/utils/photoReports', () => ({
  createPhotoReport: vi.fn(),
  updatePhotoReport: vi.fn(),
  newReportSection: (order) => ({
    id: `section-${order}`,
    order,
    subtitle: '',
    description: '',
    photoIds: [],
  }),
  createReportTemplate: vi.fn(),
  updateReportTemplate: vi.fn(),
  fetchPhotoReports: vi.fn(),
}))

vi.mock('@/utils/leadActivity', () => ({ logLeadReportEvent: vi.fn() }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'user_1', email: 'alex@example.com', displayName: 'Alex Rivera' },
    getToken: async () => 'token',
  }),
}))
vi.mock('@/photos/photosClient', () => ({ fetchPhotoThumbnailBlob: vi.fn() }))
vi.mock('@/utils/clientPreview', () => ({
  fetchClientPreviewUrl: vi.fn(),
  prepareClientPreviewTab: vi.fn(),
  closeClientPreviewTab: vi.fn(),
  openClientPreviewUrl: vi.fn(),
}))
vi.mock('@/utils/reportEditorDraft', () => ({
  saveReportEditorDraft: vi.fn(),
  loadReportEditorDraft: () => null,
  clearReportEditorDraft: vi.fn(),
  sectionsHavePhotoIds: () => false,
  sortReportSections: (sections) => sections,
  resolveEditorSeed: ({ initialReport, layoutTemplate }) => ({
    title: initialReport?.title || layoutTemplate?.title || 'Photo Report',
    sections: initialReport?.sections || layoutTemplate?.sections || [{
      id: 'section-0',
      order: 0,
      subtitle: '',
      description: '',
      photoIds: [],
    }],
    reportId: initialReport?.id || null,
  }),
}))
vi.mock('./SendReportDialog', () => ({ SendReportDialog: () => null }))

describe('ReportBuilder new report lead selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>'
  })

  it('keeps required lead selection inside the new report panel', async () => {
    render(
      <ReportBuilder
        open
        mode="report"
        leads={[{
          id: 'lead-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          address: '12 Main St',
          photos: [],
        }]}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'New report' })).toBeTruthy()
    expect(screen.getByLabelText('Search leads')).toBeTruthy()
    expect(document.querySelector('.report-editor-panel.square-picker-panel')).toBeNull()

    fireEvent.click(screen.getByText('Ada Lovelace'))

    await waitFor(() => {
      expect(screen.getByLabelText('Clear lead selection')).toBeTruthy()
    })
    expect(screen.queryByLabelText('Search leads')).toBeNull()
  })
})
