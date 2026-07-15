/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PipeStageHeader } from '../PipeStageHeader'

describe('PipeStageHeader', () => {
  it('uses the status color and collapses from its header control', () => {
    const onToggle = vi.fn()
    render(
      <PipeStageHeader
        label="Qualified"
        count={4}
        color="bg-amber-500/20 text-amber-200 border-amber-400/40"
        collapsed={false}
        onToggle={onToggle}
      />,
    )

    const header = screen.getByRole('button', { name: /qualified/i })
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(header.className).toContain('bg-amber-500/20')
    expect(screen.getByText('4')).toBeTruthy()

    fireEvent.click(header)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('labels a collapsed stage as expandable', () => {
    render(
      <PipeStageHeader
        label="Closed"
        count={2}
        color="bg-green-500/20"
        collapsed
        onToggle={() => {}}
      />,
    )

    const header = screen.getByRole('button', { name: /closed/i })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.getAttribute('title')).toBe('Expand Closed')
  })
})
