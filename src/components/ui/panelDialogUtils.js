/**
 * Map list panels close via explicit back only — Radix onOpenChange(false) is ignored
 * so sibling panels (e.g. docked Tasks) closing do not double-pop the stack.
 */
export function ignoreRadixMapPanelDismiss(open) {
  if (!open) return
}

/**
 * Keep the list dialog open while a nested detail is showing, or while this panel
 * is the outgoing panel in a primary↔primary swap (so exit can crossfade).
 *
 * @param {boolean} isPanelOpen
 * @param {{ showingDetail?: boolean, retainOpen?: boolean }} [opts]
 */
export function mapListDialogOpen(isPanelOpen, opts = {}) {
  if (isPanelOpen) return true
  if (opts.showingDetail) return true
  if (opts.retainOpen) return true
  return false
}

/**
 * Visually recede the list panel while detail opens on top, or while this panel
 * is fading out during a primary swap (same duration as detail/swap enter).
 *
 * @param {boolean} isPanelOpen
 * @param {boolean} hasNestedDetail
 * @param {{ showingDetail?: boolean, retainOpen?: boolean, swappingOut?: boolean }} [opts]
 */
export function listPanelObscuredByDetail(isPanelOpen, hasNestedDetail, opts = {}) {
  const visuallyOpen = mapListDialogOpen(isPanelOpen, opts)
  if (!visuallyOpen) return false
  if (opts.swappingOut) return true
  return !!hasNestedDetail
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
