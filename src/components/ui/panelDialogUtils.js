/** Ignore Radix parent-dialog dismiss while a nested detail overlay is open. */
export function handlePanelDialogOpenChange(open, hasNestedDetail, onPanelBack) {
  if (!open) {
    if (hasNestedDetail) return
    onPanelBack?.()
  }
}
