/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateTaskPanel } from '../CreateTaskPanel'

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  scheduleSync: vi.fn(),
}))

vi.mock('../NewTaskDialog', () => ({
  NewTaskDialog: ({ open, onSubmit }) => open ? (
    <button
      type="button"
      onClick={() => onSubmit({
        title: 'Follow up',
        scheduledAt: null,
        scheduledEndAt: null,
        assignedUids: [],
        leadId: 'lead-1',
        dealId: null,
      })}
    >
      Submit task
    </button>
  ) : null,
}))

vi.mock('../ConvertToLeadPipelineDialog', () => ({
  ConvertToLeadPipelineDialog: () => null,
}))

vi.mock('@/contexts/UserDataSyncContext', () => ({
  useUserDataSync: () => ({ scheduleSync: mocks.scheduleSync }),
}))

vi.mock('@/utils/leadTasks', () => ({
  addTask: mocks.addTask,
}))

vi.mock('@/utils/pipelineTasks', () => ({
  addPipelineTask: vi.fn(),
  pipelinesContainingParcel: () => [],
}))

vi.mock('@/utils/teamTasks', () => ({
  addTeamTask: vi.fn(),
}))

vi.mock('@/utils/teamTaskUtils', () => ({
  getAllTeamMembers: () => [],
  resolveTeamTaskLeadId: () => null,
  shouldStoreAsTeamTask: () => false,
}))

vi.mock('@/utils/deals', () => ({
  flattenDealsFromPipelines: () => [],
}))

vi.mock('@/utils/taskCreateFlow', () => ({
  createServerAssignedTask: vi.fn(),
  resolveTaskContext: ({ leadId, dealId }) => ({
    leadId,
    dealId,
    parcelId: null,
    pipelineId: null,
  }),
}))

vi.mock('../ui/toast', () => ({
  showToast: vi.fn(),
}))

describe('CreateTaskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the shared create flow and closes after saving a personal task', async () => {
    const onOpenChange = vi.fn()
    const onCreated = vi.fn()

    render(
      <CreateTaskPanel
        open
        onOpenChange={onOpenChange}
        leads={[{ id: 'lead-1', firstName: 'Ada' }]}
        onCreated={onCreated}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Submit task' }))

    await waitFor(() => {
      expect(mocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Follow up',
        leadId: 'lead-1',
      }))
    })
    expect(mocks.scheduleSync).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCreated).toHaveBeenCalledOnce()
  })
})
