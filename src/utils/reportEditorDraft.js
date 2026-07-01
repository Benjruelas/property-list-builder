const DRAFT_KEY_PREFIX = 'reportEditorDraft:'

export function reportEditorDraftKey(leadId) {
  if (!leadId) return null
  return `${DRAFT_KEY_PREFIX}${leadId}`
}

export function saveReportEditorDraft(draft) {
  if (typeof sessionStorage === 'undefined') return
  const leadId = draft?.leadId
  const key = reportEditorDraftKey(leadId)
  if (!key) return
  try {
    sessionStorage.setItem(key, JSON.stringify({
      ...draft,
      updatedAt: Date.now(),
    }))
  } catch {
    /* ignore quota errors */
  }
}

export function loadReportEditorDraft(leadId) {
  if (typeof sessionStorage === 'undefined' || !leadId) return null
  const key = reportEditorDraftKey(leadId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.leadId !== leadId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearReportEditorDraft(leadId) {
  if (typeof sessionStorage === 'undefined' || !leadId) return
  try {
    sessionStorage.removeItem(reportEditorDraftKey(leadId))
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
