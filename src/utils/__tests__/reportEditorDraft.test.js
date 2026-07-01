import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveReportEditorDraft,
  loadReportEditorDraft,
  clearReportEditorDraft,
  sectionsHavePhotoIds,
  sortReportSections,
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
})
