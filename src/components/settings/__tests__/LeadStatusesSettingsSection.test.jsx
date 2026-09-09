/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeadStatusesSettingsContent } from '../LeadStatusesSettingsSection'

vi.mock('../../ui/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/utils/teams', () => ({ updateTeamSettings: vi.fn() }))

const STATUSES = [
  { id: 'new', label: 'New', autoTasks: [] },
  { id: 'contacted', label: 'Contacted', autoTasks: [] },
  { id: 'converted', label: 'Converted', autoTasks: [] },
]

function labelValues() {
  return screen.getAllByLabelText(/^Label for /).map((input) => input.value)
}

describe('LeadStatusesSettingsContent reorder', () => {
  afterEach(() => {
    cleanup()
  })

  it('moves a status down with the arrow control', () => {
    render(
      <LeadStatusesSettingsContent
        isOpen
        canEdit
        leadStatuses={STATUSES}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move New down' }))

    expect(labelValues()).toEqual(['Contacted', 'New', 'Converted'])
  })

  it('saves the reordered statuses', () => {
    const onSaveUserStatuses = vi.fn()
    render(
      <LeadStatusesSettingsContent
        isOpen
        canEdit
        leadStatuses={STATUSES}
        onSaveUserStatuses={onSaveUserStatuses}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move New down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save statuses' }))

    expect(onSaveUserStatuses).toHaveBeenCalled()
    expect(onSaveUserStatuses.mock.calls[0][0].map((status) => status.id)).toEqual([
      'contacted',
      'new',
      'converted',
    ])
  })
})
