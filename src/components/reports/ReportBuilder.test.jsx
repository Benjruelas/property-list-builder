/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ReportBuilder } from './ReportBuilder'

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

    expect(screen.getByText('New report')).toBeTruthy()
    expect(screen.getByLabelText('Search leads')).toBeTruthy()
    expect(document.querySelector('.report-editor-panel.square-picker-panel')).toBeNull()

    fireEvent.click(screen.getByText('Ada Lovelace'))

    await waitFor(() => {
      expect(screen.getByLabelText('Clear lead selection')).toBeTruthy()
    })
    expect(screen.queryByLabelText('Search leads')).toBeNull()
  })
})
