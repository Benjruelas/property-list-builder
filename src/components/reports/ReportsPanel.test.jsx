/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportsPanel } from './ReportsPanel'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ getToken: async () => 'token' }),
}))

vi.mock('../../utils/photoReports', () => ({
  fetchPhotoReports: vi.fn(async () => []),
  fetchReportTemplates: vi.fn(async () => [
    { id: 'tmpl-1', name: 'Roof layout', sections: [{ id: 's1', order: 0 }] },
  ]),
  createReportTemplate: vi.fn(),
  deletePhotoReport: vi.fn(),
  deleteReportTemplate: vi.fn(),
  DEFAULT_REPORT_TEMPLATE: { name: 'Default', title: 'Photo Report', sections: [] },
}))

vi.mock('../../utils/settings', () => ({
  getSettings: () => ({}),
  updateSettings: vi.fn(),
}))

vi.mock('@/utils/leads', () => ({
  displayLeadName: (lead) => [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || lead?.id || '',
  formatLeadAddress: (lead) => lead?.address || '',
}))

vi.mock('@/utils/leadActivity', () => ({
  logLeadReportEvent: vi.fn(),
}))

vi.mock('../../utils/reportEditorDraft', () => ({
  clearReportEditorDraft: vi.fn(),
  clearReportEditorDraftForReport: vi.fn(),
}))

vi.mock('../ui/toast', () => ({ showToast: vi.fn() }))
vi.mock('../ui/confirm-dialog', () => ({ showConfirm: vi.fn() }))

vi.mock('./ReportBuilder', () => ({
  ReportBuilder: ({ open }) => (open ? <div>Report builder</div> : null),
}))

vi.mock('./ReportDetail', () => ({
  ReportDetail: () => null,
}))

vi.mock('./SendReportDialog', () => ({
  SendReportDialog: () => null,
}))

const LEAD = { id: 'lead-1', firstName: 'Ada', lastName: 'Lovelace' }

function renderFromLead(editorFrame, extra = {}) {
  return render(
    <ReportsPanel
      isOpen
      leads={[LEAD]}
      editorFrame={editorFrame}
      onPatchEditor={extra.onPatchEditor}
      onCloseEditor={extra.onCloseEditor}
      onOpenEditor={extra.onOpenEditor}
    />,
  )
}

describe('ReportsPanel create report from lead', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>'
  })

  it('opens the report builder after a template is chosen from lead detail', async () => {
    const onPatchEditor = vi.fn()
    const onCloseEditor = vi.fn()
    const editorFrame = { mode: 'report', leadId: 'lead-1', awaitingTemplate: true }

    const { rerender } = renderFromLead(editorFrame, { onPatchEditor, onCloseEditor })

    fireEvent.click(await screen.findByRole('button', { name: /no template/i }))

    expect(onCloseEditor).not.toHaveBeenCalled()
    expect(onPatchEditor).toHaveBeenCalledWith({
      layoutTemplate: null,
      awaitingTemplate: false,
    })
    expect(screen.queryByText('Report builder')).toBeNull()

    rerender(
      <ReportsPanel
        isOpen
        leads={[LEAD]}
        editorFrame={{
          mode: 'report',
          leadId: 'lead-1',
          awaitingTemplate: false,
          layoutTemplate: null,
        }}
        onPatchEditor={onPatchEditor}
        onCloseEditor={onCloseEditor}
      />,
    )

    expect(screen.getByText('Report builder')).toBeTruthy()
  })

  it('applies the chosen layout template without closing the editor', async () => {
    const onPatchEditor = vi.fn()
    const onCloseEditor = vi.fn()

    renderFromLead(
      { mode: 'report', leadId: 'lead-1', awaitingTemplate: true },
      { onPatchEditor, onCloseEditor },
    )

    fireEvent.click(await screen.findByRole('button', { name: /roof layout/i }))

    expect(onCloseEditor).not.toHaveBeenCalled()
    expect(onPatchEditor).toHaveBeenCalledWith({
      layoutTemplate: expect.objectContaining({ id: 'tmpl-1', name: 'Roof layout' }),
      awaitingTemplate: false,
    })
  })

  it('keeps the editor closed when the lead template picker is cancelled', async () => {
    const onPatchEditor = vi.fn()
    const onCloseEditor = vi.fn()

    renderFromLead(
      { mode: 'report', leadId: 'lead-1', awaitingTemplate: true },
      { onPatchEditor, onCloseEditor },
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onPatchEditor).not.toHaveBeenCalled()
    expect(onCloseEditor).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Report builder')).toBeNull()
  })
})
