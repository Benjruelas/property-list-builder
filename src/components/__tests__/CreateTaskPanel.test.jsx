/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateTaskPanel } from '../CreateTaskPanel'
import { createServerTask } from '@/utils/serverTaskOps'

vi.mock('../NewTaskDialog', () => ({
  NewTaskDialog: ({ open, onSubmit, saving }) => open ? (
    <>
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
      <button
        type="button"
        onClick={() => onSubmit({
          title: 'Assigned task',
          scheduledAt: null,
          scheduledEndAt: null,
          assignedUids: ['teammate-1'],
          leadId: 'lead-1',
          dealId: null,
        })}
      >
        Submit assigned task
      </button>
      <span data-testid="saving-state">{saving ? 'saving' : 'idle'}</span>
    </>
  ) : null,
}))

vi.mock('../MoveDealDialog', () => ({
  MoveDealDialog: () => null,
}))

vi.mock('@/utils/pipelineTasks', () => ({
  pipelinesContainingParcel: () => [],
}))

vi.mock('@/utils/teamTaskUtils', () => ({
  getAllTeamMembers: () => [],
}))

vi.mock('@/utils/deals', () => ({
  flattenDealsFromPipelines: () => [],
}))

vi.mock('@/utils/taskCreateFlow', () => ({
  resolveTaskContext: ({ leadId, dealId }) => ({
    leadId,
    dealId,
    parcelId: null,
    pipelineId: null,
  }),
}))

vi.mock('@/utils/serverTaskOps', () => ({
  createServerTask: vi.fn(),
}))

vi.mock('../ui/toast', () => ({
  showToast: vi.fn(),
}))

describe('CreateTaskPanel', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    createServerTask.mockResolvedValue({ id: 'task-1' })
  })

  it('requires sign-in to create tasks', async () => {
    const { showToast } = await import('../ui/toast')
    render(
      <CreateTaskPanel
        open
        leads={[{ id: 'lead-1', firstName: 'Ada' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Submit task' }))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Sign in to create tasks', 'error')
    })
    expect(createServerTask).not.toHaveBeenCalled()
  })

  it('uses server create and closes after save', async () => {
    const onOpenChange = vi.fn()
    const onCreated = vi.fn()

    render(
      <CreateTaskPanel
        open
        onOpenChange={onOpenChange}
        getToken={async () => 'token'}
        leads={[{ id: 'lead-1', firstName: 'Ada' }]}
        onCreated={onCreated}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Submit task' }))

    await waitFor(() => {
      expect(createServerTask).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
        title: 'Follow up',
      }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCreated).toHaveBeenCalledOnce()
  })

  it('ignores duplicate submits while create is in flight', async () => {
    const onOpenChange = vi.fn()
    let resolveCreate
    createServerTask.mockImplementation(
      () => new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    render(
      <CreateTaskPanel
        open
        onOpenChange={onOpenChange}
        getToken={async () => 'token'}
        leads={[{ id: 'lead-1', firstName: 'Ada' }]}
      />,
    )

    const submit = screen.getByRole('button', { name: 'Submit task' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    await waitFor(() => {
      expect(createServerTask).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('saving-state').textContent).toBe('saving')
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    resolveCreate({ id: 'task-1' })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
