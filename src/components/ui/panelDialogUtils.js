/**
 * Map list panels close via explicit back only — Radix onOpenChange(false) is ignored
 * so sibling panels (e.g. docked Tasks) closing do not double-pop the stack.
 */
export function ignoreRadixMapPanelDismiss(open) {
  if (!open) return
}

/**
 * Keep the list dialog open while a nested detail is showing so list + detail can crossfade.
 */
export function mapListDialogOpen(isPanelOpen) {
  return isPanelOpen
}

/** Visually recede the list panel while detail opens on top (same duration as detail enter). */
export function listPanelObscuredByDetail(isPanelOpen, hasNestedDetail) {
  return !!isPanelOpen && !!hasNestedDetail
}

/**
 * Handle Radix dialog dismiss for controlled map panels.
 * Only runs onPanelBack for user-initiated closes — when the parent already set
 * `open` false via navigation, ignore the matching onOpenChange(false) callback.
 */
export function handlePanelDialogOpenChange(open, hasNestedOverlay, onPanelBack, wasOpen = true, opts = {}) {
  if (!open) {
    if (!wasOpen) return
    if (hasNestedOverlay) return
    if (opts.retainOpen) return
    onPanelBack?.()
  }
}

/**
 * Dismiss handler for child/secondary map overlays (detail panels, editors, popups).
 * Root list panels and Tasks should use ignoreRadixMapPanelDismiss instead.
 *
 * @param {boolean} open — Radix onOpenChange open flag
 * @param {Function} onClose — close callback when user dismisses via click-out or Escape
 * @param {{ suppress?: boolean, hasNestedOverlay?: boolean, wasOpen?: boolean, retainOpen?: boolean }} [opts]
 */
export function handleChildPanelDismiss(open, onClose, opts = {}) {
  const {
    suppress = false,
    hasNestedOverlay = false,
    wasOpen = true,
    retainOpen = false,
  } = opts
  if (!open) {
    if (!wasOpen) return
    if (suppress || hasNestedOverlay) return
    if (retainOpen) return
    onClose?.()
  }
}
