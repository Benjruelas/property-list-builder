/**
 * Map list panels close via explicit back only — Radix onOpenChange(false) is ignored
 * so sibling panels (e.g. docked Tasks) closing do not double-pop the stack.
 */
export function ignoreRadixMapPanelDismiss(open) {
  if (!open) return
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
