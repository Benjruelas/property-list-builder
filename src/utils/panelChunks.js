/**
 * Shared dynamic imports for map panels — used by React.lazy and background prefetch.
 */

/** @type {Set<string>} */
const loadedPanelKeys = new Set()

export const panelLazy = {
  forms: () => import('../components/forms/FormsPanel').then((m) => ({ default: m.FormsPanel })),
  dealPipeline: () => import('../components/DealPipeline').then((m) => ({ default: m.DealPipeline })),
  schedule: () => import('../components/SchedulePanel').then((m) => ({ default: m.SchedulePanel })),
  tasks: () => import('../components/TasksPanel').then((m) => ({ default: m.TasksPanel })),
  paths: () => import('../components/PathsPanel').then((m) => ({ default: m.PathsPanel })),
  quotes: () => import('../components/quotes/QuotesPanel').then((m) => ({ default: m.QuotesPanel })),
  reports: () => import('../components/reports/ReportsPanel').then((m) => ({ default: m.ReportsPanel })),
  settings: () => import('../components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
  leads: () => import('../components/LeadsPanel').then((m) => ({ default: m.LeadsPanel })),
  deals: () => import('../components/DealsPanel').then((m) => ({ default: m.DealsPanel })),
  outreach: () => import('../components/OutreachPanel').then((m) => ({ default: m.OutreachPanel })),
  emailComposer: () => import('../components/outreach/SendOutreachDialog').then((m) => ({ default: m.SendOutreachDialog })),
  hailData: () => import('../components/HailDataPanel').then((m) => ({ default: m.HailDataPanel })),
}

export function isPanelChunkLoaded(key) {
  return loadedPanelKeys.has(key)
}

/** Load a panel chunk and mark it ready for Suspense-free mount. */
export function loadPanelChunk(key) {
  const loader = panelLazy[key]
  if (!loader) return Promise.resolve()
  if (loadedPanelKeys.has(key)) return Promise.resolve()
  return loader()
    .then(() => {
      loadedPanelKeys.add(key)
    })
    .catch(() => {})
}

/** Prefetch a single panel (e.g. on action-bar hover). */
export function prefetchPanel(key) {
  loadPanelChunk(key).catch(() => {})
}

/** Warm all lazy panel chunks after sign-in so first open does not flash. */
export function prefetchAllPanels() {
  Object.keys(panelLazy).forEach((key) => {
    prefetchPanel(key)
  })
}
