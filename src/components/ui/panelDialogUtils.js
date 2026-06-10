/**
 * Handle Radix dialog dismiss for controlled map panels.
 * Only runs onPanelBack for user-initiated closes — when the parent already set
 * `open` false via navigation, ignore the matching onOpenChange(false) callback.
 */
export function handlePanelDialogOpenChange(open, hasNestedOverlay, onPanelBack, wasOpen = true) {
  if (!open) {
    if (!wasOpen) return
    if (hasNestedOverlay) return
    onPanelBack?.()
  }
}
