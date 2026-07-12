/**
 * Lightweight PDF cache metadata helpers.
 * Kept separate from ensureReportPdf.js so list/CRUD routes do not import Chromium.
 */

/** Bump when PDF layout/generation changes so pre-existing cached PDFs regenerate. */
export const REPORT_PDF_VERSION = 4

/**
 * Cached PDFs from before REPORT_PDF_VERSION must be rebuilt (e.g. old PDFKit layout).
 */
export function isReportPdfStale(report) {
  return !report?.pdfKey || report.pdfVersion !== REPORT_PDF_VERSION
}

/** True when title/sections changed enough that a cached PDF is stale. */
export function reportPdfContentChanged(existing, next) {
  if (!existing) return true
  if ((existing.title || '') !== (next.title || '')) return true
  return JSON.stringify(existing.sections || []) !== JSON.stringify(next.sections || [])
}
