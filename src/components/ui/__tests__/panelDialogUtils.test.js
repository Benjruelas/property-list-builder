import { describe, it, expect, vi } from 'vitest'
import { handlePanelDialogOpenChange, handleChildPanelDismiss } from '../panelDialogUtils'

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
