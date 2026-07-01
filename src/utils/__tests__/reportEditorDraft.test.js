import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveReportEditorDraft,
  loadReportEditorDraft,
  clearReportEditorDraft,
  clearReportEditorDraftForReport,
  sectionsHavePhotoIds,
  sortReportSections,
  draftMatchesEditorSession,
  resolveEditorSeed,
} from '../reportEditorDraft.js'

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

const draftWithPhotos = {
  leadId: 'lead_1',
  reportId: 'preport_old',
  title: 'Old Report',
  sections: [{ id: 's1', subtitle: 'A', description: '', photoIds: ['p1'], order: 0 }],
}

describe('reportEditorDraft', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('round-trips draft by lead id', () => {
    const draft = {
      leadId: 'lead_1',
      reportId: 'preport_1',
      title: 'Roof Report',
      sections: [{ id: 's1', subtitle: 'A', description: '', photoIds: ['p1'], order: 0 }],
      templateId: null,
    }
    saveReportEditorDraft(draft)
    expect(loadReportEditorDraft('lead_1')).toMatchObject(draft)
    clearReportEditorDraft('lead_1')
    expect(loadReportEditorDraft('lead_1')).toBeNull()
  })

  it('clears draft only for the deleted report', () => {
    saveReportEditorDraft(draftWithPhotos)
    clearReportEditorDraftForReport('lead_1', 'preport_other')
    expect(loadReportEditorDraft('lead_1')).toMatchObject(draftWithPhotos)
    clearReportEditorDraftForReport('lead_1', 'preport_old')
    expect(loadReportEditorDraft('lead_1')).toBeNull()
  })

  it('sectionsHavePhotoIds detects selections', () => {
    expect(sectionsHavePhotoIds([{ photoIds: [] }])).toBe(false)
    expect(sectionsHavePhotoIds([{ photoIds: ['p1'] }])).toBe(true)
  })

  it('sortReportSections orders by order field', () => {
    const sorted = sortReportSections([
      { id: 'b', order: 1 },
      { id: 'a', order: 0 },
    ])
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('draftMatchesEditorSession rejects stale saved report drafts for new reports', () => {
    expect(draftMatchesEditorSession(draftWithPhotos, { leadId: 'lead_1' })).toBe(false)
    expect(draftMatchesEditorSession(draftWithPhotos, { leadId: 'lead_1', reportId: 'preport_old' })).toBe(true)
  })

  it('resolveEditorSeed uses template for new report instead of stale draft', () => {
    saveReportEditorDraft(draftWithPhotos)
    const seed = resolveEditorSeed({
      initialReport: null,
      initialLeadId: 'lead_1',
      layoutTemplate: {
        name: 'Inspection',
        title: 'Fresh Report',
        sections: [{ subtitle: 'Overview', description: 'Notes', order: 0 }],
      },
      draft: loadReportEditorDraft('lead_1'),
    })
    expect(seed.title).toBe('Fresh Report')
    expect(seed.reportId).toBeNull()
    expect(seed.sections.every((s) => s.photoIds.length === 0)).toBe(true)
  })

  it('resolveEditorSeed keeps draft for in-progress unsaved new report', () => {
    const unsavedDraft = {
      leadId: 'lead_1',
      reportId: null,
      title: 'Draft Report',
      sections: [{ id: 's1', subtitle: 'A', description: '', photoIds: ['p1'], order: 0 }],
    }
    const seed = resolveEditorSeed({
      initialReport: null,
      initialLeadId: 'lead_1',
      layoutTemplate: null,
      draft: unsavedDraft,
    })
    expect(seed.title).toBe('Draft Report')
    expect(seed.reportId).toBeNull()
    expect(seed.sections[0].photoIds).toEqual(['p1'])
  })
})
