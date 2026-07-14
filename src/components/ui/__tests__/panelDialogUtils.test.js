/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  handlePanelDialogOpenChange,
  handleChildPanelDismiss,
  mapListDialogOpen,
  listPanelObscuredByDetail,
  useListDialogUnderDetail,
} from '../panelDialogUtils'

describe('mapListDialogOpen', () => {
  it('stays open while the list frame is on the stack', () => {
    expect(mapListDialogOpen(true)).toBe(true)
    expect(mapListDialogOpen(false)).toBe(false)
  })

  it('keeps the dialog open under a promoted detail', () => {
    expect(mapListDialogOpen(false, { showingDetail: true })).toBe(true)
  })
})

describe('listPanelObscuredByDetail', () => {
  it('obscures only when the list is visually open under detail', () => {
    expect(listPanelObscuredByDetail(true, true)).toBe(true)
    expect(listPanelObscuredByDetail(false, true)).toBe(false)
    expect(listPanelObscuredByDetail(false, true, { showingDetail: true })).toBe(true)
  })
})

describe('useListDialogUnderDetail', () => {
  it('retains the list under detail only after the list was open', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, showingDetail }) => useListDialogUnderDetail(isOpen, showingDetail),
      { initialProps: { isOpen: true, showingDetail: false } },
    )
    expect(result.current.listDialogOpen).toBe(true)
    expect(result.current.listObscuredByDetail).toBe(false)

    rerender({ isOpen: false, showingDetail: true })
    expect(result.current.listDialogOpen).toBe(true)
    expect(result.current.listObscuredByDetail).toBe(true)
  })

  it('does not mount a list under standalone detail opened without a prior list', () => {
    const { result } = renderHook(
      ({ isOpen, showingDetail }) => useListDialogUnderDetail(isOpen, showingDetail),
      { initialProps: { isOpen: false, showingDetail: true } },
    )
    expect(result.current.listDialogOpen).toBe(false)
    expect(result.current.listObscuredByDetail).toBe(false)
  })
})

describe('handlePanelDialogOpenChange', () => {
  it('calls onPanelBack when user dismisses an open panel', () => {
    const onPanelBack = vi.fn()
    handlePanelDialogOpenChange(false, false, onPanelBack, true)
    expect(onPanelBack).toHaveBeenCalledOnce()
  })

  it('ignores dismiss when panel was already closed by navigation', () => {
    const onPanelBack = vi.fn()
    handlePanelDialogOpenChange(false, false, onPanelBack, false)
    expect(onPanelBack).not.toHaveBeenCalled()
  })

  it('ignores dismiss while a nested overlay is open', () => {
    const onPanelBack = vi.fn()
    handlePanelDialogOpenChange(false, true, onPanelBack, true)
    expect(onPanelBack).not.toHaveBeenCalled()
  })

  it('ignores dismiss when docked primary panel must stay open', () => {
    const onPanelBack = vi.fn()
    handlePanelDialogOpenChange(false, false, onPanelBack, true, { retainOpen: true })
    expect(onPanelBack).not.toHaveBeenCalled()
  })
})

describe('handleChildPanelDismiss', () => {
  it('calls onClose when user dismisses an open child overlay', () => {
    const onClose = vi.fn()
    handleChildPanelDismiss(false, onClose, { wasOpen: true })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores dismiss while nested overlay is open', () => {
    const onClose = vi.fn()
    handleChildPanelDismiss(false, onClose, { hasNestedOverlay: true, wasOpen: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores dismiss for promoted primary detail panels', () => {
    const onClose = vi.fn()
    handleChildPanelDismiss(false, onClose, { suppress: true, wasOpen: true })
    expect(onClose).not.toHaveBeenCalled()
  })
})
