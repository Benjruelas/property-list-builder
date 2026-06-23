/** Shared schema for KnockScout manual regression tests. */

export const ALL = ['solo', 'team-admin', 'team-member', 'logged-out']
export const IN = ['solo', 'team-admin', 'team-member']
export const ADM = ['solo', 'team-admin']

export const SECTIONS = [
  { id: '01', title: 'Auth and bootstrap' },
  { id: '02', title: 'Map and parcels' },
  { id: '03', title: 'Navigation and action bar' },
  { id: '04', title: 'Lists and parcels' },
  { id: '05', title: 'Leads CRM' },
  { id: '06', title: 'Deals and pipes' },
  { id: '07', title: 'Tasks and schedule' },
  { id: '08', title: 'Paths, activity, and settings' },
  { id: '09', title: 'Forms, quotes, and reports' },
  { id: '10', title: 'Teams and outreach' },
  { id: '11', title: 'Cross-panel flows' },
  { id: '12', title: 'Public routes and edge cases' },
]

/**
 * One actionable manual test step.
 * @param {string} action - Imperative user action (include UI path when helpful)
 * @param {string} verify - Observable pass criteria before continuing
 * @param {string} [ui] - Short UI surface label for agent routing
 */
export function step(action, verify, ui = '') {
  const s = { action, verify }
  if (ui) s.ui = ui
  return s
}

export function tc(id, section, title, roles, viewport, preconditions, steps, expected) {
  return { id, section, title, roles, viewport, preconditions, steps, expected }
}

/** Flatten steps for search/export (supports legacy string steps). */
export function stepSearchText(steps) {
  return steps.flatMap((s) => {
    if (typeof s === 'string') return [s]
    return [s.action, s.verify, s.ui || ''].filter(Boolean)
  })
}

export function normalizeSteps(steps) {
  return steps.map((s, i) => {
    if (typeof s === 'string') {
      return { n: i + 1, action: s, verify: 'Step completes without error.', ui: '' }
    }
    return { n: i + 1, action: s.action, verify: s.verify, ui: s.ui || '' }
  })
}

export const FAILURE_NOTE_TEMPLATE = `Failed at step #:
Step action attempted:
Expected at that step (verify):
Actual behavior:
UI surface:
Console/network errors:
Screenshot or recording:
Regression test ID:`
