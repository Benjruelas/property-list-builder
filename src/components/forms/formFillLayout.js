/**
 * Form fill UI layout — Glass (bottom dock) in app, centered guide on public links.
 */

/** @returns {'bottom-dock'|'recipient'} */
export function resolveFormUiLayout(isPublic) {
  return isPublic ? 'recipient' : 'bottom-dock'
}
