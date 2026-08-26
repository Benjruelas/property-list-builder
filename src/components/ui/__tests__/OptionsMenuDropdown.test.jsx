/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OptionsMenuDropdown, OptionsMenuItem } from '../OptionsMenuDropdown'

describe('OptionsMenuItem', () => {
  it('invokes onClick when enabled', () => {
    const onClick = vi.fn()
    render(
      <OptionsMenuItem onClick={onClick}>
        View
      </OptionsMenuItem>,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <OptionsMenuItem disabled onClick={onClick}>
        Download
      </OptionsMenuItem>,
    )
    const item = screen.getByRole('menuitem', { name: 'Download' })
    expect(item.disabled).toBe(true)
    fireEvent.click(item)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('OptionsMenuDropdown', () => {
  it('renders View Download Delete actions when open', () => {
    document.body.innerHTML = '<div id="modal-root"></div>'
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    const triggerRef = { current: trigger }

    render(
      <OptionsMenuDropdown
        open
        onClose={() => {}}
        triggerRef={triggerRef}
        dataAttr="data-lead-form-actions-menu"
      >
        <OptionsMenuItem onClick={() => {}}>View</OptionsMenuItem>
        <OptionsMenuItem disabled onClick={() => {}}>Download</OptionsMenuItem>
        <OptionsMenuItem destructive disabled onClick={() => {}}>Delete</OptionsMenuItem>
      </OptionsMenuDropdown>,
    )

    expect(document.querySelector('[data-lead-form-actions-menu]')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'View' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Download' }).disabled).toBe(true)
    expect(screen.getByRole('menuitem', { name: 'Delete' }).disabled).toBe(true)
  })
})
