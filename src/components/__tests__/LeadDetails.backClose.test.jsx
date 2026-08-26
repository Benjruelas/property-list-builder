/**
 * @vitest-environment jsdom
 *
 * Regression: lead form actions added useCallback after
 * `if (!isOpen || !lead) return null`. Hitting back set isOpen=false and
 * skipped that hook → "Rendered fewer hooks than expected".
 */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeadDetails } from '../LeadDetails'

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
}))

vi.mock('../ui/panel-header', () => ({
  PanelBackButton: ({ onClick }) => (
    <button type="button" onClick={onClick}>
      Back
    </button>
  ),
  PanelCreateButton: () => null,
}))

vi.mock('../ui/button', () => ({
  Button: ({ children, ...props }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock('../ui/OptionsMenuDropdown', () => ({
  OptionsMenuDropdown: () => null,
  OptionsMenuItem: ({ children }) => <div>{children}</div>,
}))

vi.mock('../ui/toast', () => ({ showToast: vi.fn() }))
vi.mock('../ui/confirm-dialog', () => ({ showConfirm: vi.fn(async () => false) }))
vi.mock('../ui/panelDialogUtils', () => ({ ignoreRadixMapPanelDismiss: () => {} }))
vi.mock('../ui/StorageUsageBar', () => ({ StorageUsageBar: () => null }))
vi.mock('../ui/FilePreviewOverlay', () => ({ FilePreviewOverlay: () => null }))
vi.mock('../tags/TagPicker', () => ({ TagPicker: () => null }))
vi.mock('../ResourceSharePicker', () => ({ VisibilityBadge: () => null }))
vi.mock('../ShareResourceDialog', () => ({ ShareResourceDialog: () => null }))
vi.mock('../share/SendResourceShareDialog', () => ({ SendResourceShareDialog: () => null }))
vi.mock('../leads/LeadOwnerChip', () => ({ LeadOwnerChip: () => null }))
vi.mock('../leads/LeadContactActionTile', () => ({ LeadContactActionTile: () => null }))
vi.mock('../leads/LeadAddressActionTile', () => ({ LeadAddressActionTile: () => null }))
vi.mock('../leads/LeadContactSourceIcon', () => ({ LeadContactSourceIcon: () => null }))
vi.mock('../LeadTasksSection', () => ({ LeadTasksSection: () => null }))
vi.mock('../DealProfitBadge', () => ({ DealProfitBadge: () => null }))
vi.mock('../CustomFieldsEditor', () => ({ CustomFieldsEditor: () => null }))
vi.mock('../DirectionsProviderDialog', () => ({ DirectionsProviderDialog: () => null }))
vi.mock('../forms/FormCompletedView', () => ({ FormCompletedView: () => null }))
vi.mock('../quotes/QuoteStatusBadge', () => ({ QuoteStatusBadge: () => null }))
vi.mock('@/photos/PhotoGallery', () => ({ PhotoGallery: () => null }))
vi.mock('@/photos/photosClient', () => ({ invalidatePhotoBlobCache: vi.fn() }))
vi.mock('@/utils/photoReports', () => ({
  fetchLeadPhotoReports: vi.fn(async () => []),
  getReportListDate: () => null,
  invalidateCachedLeadReports: vi.fn(),
  isLeadReportsFetchInflight: () => false,
  peekCachedLeadReports: () => [],
}))
vi.mock('@/utils/leadForms', () => ({
  fetchLeadForms: vi.fn(async () => []),
  invalidateCachedLeadForms: vi.fn(),
  isLeadFormsFetchInflight: () => false,
  leadFormStatusLabel: (s) => s || '',
  peekCachedLeadForms: () => [],
}))
vi.mock('@/utils/forms', () => ({
  fetchFormSubmissionPdfBlob: vi.fn(),
  fetchFormSubmission: vi.fn(),
  deleteFormSubmission: vi.fn(),
}))
vi.mock('@/utils/filePreview', () => ({ saveBlobToDevice: vi.fn() }))
vi.mock('@/utils/panelChunks', () => ({ prefetchPanel: vi.fn() }))

const lead = {
  id: 'lead-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  notes: '',
  status: 'new',
  ownerId: 'user-1',
  visibility: 'private',
  activity: [],
  photos: [],
  files: [],
}

describe('LeadDetails back close', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not violate Rules of Hooks when isOpen flips to false', () => {
    const props = {
      lead,
      getToken: async () => 'token',
      pipelines: [],
      teams: [],
      currentUserId: 'user-1',
      currentUser: { uid: 'user-1', email: 'a@b.c' },
      onClose: vi.fn(),
    }

    const { rerender } = render(<LeadDetails {...props} isOpen />)
    expect(() => {
      rerender(<LeadDetails {...props} isOpen={false} />)
    }).not.toThrow()
  })
})
