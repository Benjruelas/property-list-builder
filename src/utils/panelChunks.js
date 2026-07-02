/**
 * Shared dynamic imports for map panels — used by React.lazy and background prefetch.
 */

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
  emailComposer: () => import('../components/EmailComposer').then((m) => ({ default: m.EmailComposer })),
  bulkEmailPreview: () => import('../components/BulkEmailPreview').then((m) => ({ default: m.BulkEmailPreview })),
  hailData: () => import('../components/HailDataPanel').then((m) => ({ default: m.HailDataPanel })),
  photoImport: () => import('../components/photos/PhotoImportDialog').then((m) => ({ default: m.PhotoImportDialog })),
}

/** Prefetch a single panel (e.g. on action-bar hover). */
export function prefetchPanel(key) {
  panelLazy[key]?.().catch(() => {})
}
