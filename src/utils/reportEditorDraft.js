import { newReportSection, sectionsFromTemplate } from './photoReports'

const DRAFT_KEY_PREFIX = 'reportEditorDraft:'

export function reportEditorDraftKey(leadId) {
  if (!leadId) return null
  return `${DRAFT_KEY_PREFIX}${leadId}`
}

export function saveReportEditorDraft(draft) {
  const leadId = draft?.leadId
  const key = reportEditorDraftKey(leadId)
  if (!key) return
  const payload = JSON.stringify({
    ...draft,
    updatedAt: Date.now(),
  })
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, payload)
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, payload)
    }
  } catch {
    /* ignore quota errors */
  }
}

export function loadReportEditorDraft(leadId) {
  if (!leadId) return null
  const key = reportEditorDraftKey(leadId)
  try {
    const raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null)
      ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.leadId !== leadId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearReportEditorDraft(leadId) {
  if (!leadId) return
  const key = reportEditorDraftKey(leadId)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key)
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export function sectionsHavePhotoIds(sections) {
  return Array.isArray(sections) && sections.some((s) => Array.isArray(s.photoIds) && s.photoIds.length > 0)
}

export function sortReportSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return sections
  return [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** True when a stored draft should hydrate the current editor session. */
export function draftMatchesEditorSession(draft, { leadId, reportId = null } = {}) {
  if (!draft || draft.leadId !== leadId) return false
  if (reportId) return draft.reportId === reportId
  return !draft.reportId
}

export function clearReportEditorDraftForReport(leadId, reportId) {
  if (!leadId || !reportId) return
  const draft = loadReportEditorDraft(leadId)
  if (draft?.reportId === reportId) clearReportEditorDraft(leadId)
}

/**
 * Choose initial editor state for a report session.
 * Drafts keyed by lead must not reopen a different saved report when creating new.
 */
export function resolveEditorSeed({ initialReport, layoutTemplate, initialLeadId, draft }) {
  const leadId = initialReport?.leadId || initialLeadId
  const reportId = initialReport?.id ?? null

  if (initialReport && sectionsHavePhotoIds(initialReport.sections)) {
    return {
      title: initialReport.title || 'Photo Report',
      sections: sortReportSections(initialReport.sections),
      reportId: initialReport.id ?? null,
    }
  }

  if (
    draft
    && sectionsHavePhotoIds(draft.sections)
    && draftMatchesEditorSession(draft, { leadId, reportId })
  ) {
    return {
      title: draft.title || initialReport?.title || layoutTemplate?.title || layoutTemplate?.name || 'Photo Report',
      sections: sortReportSections(draft.sections),
      reportId: draft.reportId || reportId || null,
    }
  }

  if (initialReport) {
    return {
      title: initialReport.title || 'Photo Report',
      sections: (initialReport.sections || []).length
        ? sortReportSections(initialReport.sections)
        : [newReportSection(0)],
      reportId: initialReport.id ?? null,
    }
  }

  if (layoutTemplate) {
    return {
      title: layoutTemplate.title || layoutTemplate.name || 'Photo Report',
      sections: sectionsFromTemplate(layoutTemplate),
      reportId: null,
    }
  }

  return {
    title: 'Photo Report',
    sections: [newReportSection(0)],
    reportId: null,
  }
}
