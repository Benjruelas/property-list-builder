/**
 * Resolve which selector to spotlight for a tour step.
 * Prefer any visible target; fall back to the menu/bar selector for retry loops.
 */
export function resolveTourSelector(step, isMobile, findTarget) {
  if (step.centered) return null

  const candidates = []
  if (step.mobileTarget) candidates.push(step.mobileTarget)
  if (step.target && step.target !== step.mobileTarget) candidates.push(step.target)

  for (const sel of candidates) {
    if (findTarget(sel)) return sel
  }

  // Menu items live under mobileTarget on both breakpoints when the bar
  // control is not mounted (compact desktop bar + mobile overflow).
  if (step.menuRequired && step.mobileTarget) {
    return step.mobileTarget
  }

  return step.target || step.mobileTarget || null
}

export function stepUsesActionBar(step, isMobile, findTarget) {
  const selector = resolveTourSelector(step, isMobile, findTarget)
  return Boolean(selector?.includes('action-bar'))
}

/**
 * Side-placed tooltips next to top map chrome can center above the spotlight
 * and clip into the iOS status bar. Keep the tooltip top at or below the
 * spotlight top so the card lines up with the focus window.
 */
export function alignSideTooltipWithSpotlightTop({ top, spotlightTop, placedBeside }) {
  if (!placedBeside) return top
  if (!Number.isFinite(top) || !Number.isFinite(spotlightTop)) return top
  return Math.max(top, spotlightTop)
}
