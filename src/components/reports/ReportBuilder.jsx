import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { handleChildPanelDismiss } from '../ui/panelDialogUtils'
import { PanelHeader } from '../ui/panel-header'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import {
  createPhotoReport,
  updatePhotoReport,
  newReportSection,
  createReportTemplate,
  updateReportTemplate,
  sectionsFromTemplate,
} from '@/utils/photoReports'
import { logLeadReportEvent } from '@/utils/leadActivity'
import { leadPhotoUrl } from '@/utils/leadPhotos'
import { cn } from '@/lib/utils'

const FIELD = 'w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm min-h-[44px]'

export function ReportBuilder({
  open,
  onClose,
  onBack,
  mode = 'report',
  report: initialReport = null,
  template: initialTemplate = null,
  layoutTemplate = null,
  leadId: initialLeadId = null,
  leads = [],
  getToken,
  onSaved,
}) {
  const isTemplate = mode === 'template'
  const [name, setName] = useState('')
  const [title, setTitle] = useState('Photo Report')
  const [sections, setSections] = useState([newReportSection(0)])
  const [saving, setSaving] = useState(false)
  const [pickerSectionId, setPickerSectionId] = useState(null)
  const [thumbUrls, setThumbUrls] = useState({})

  const lead = useMemo(() => {
    if (isTemplate) return null
    const id = initialReport?.leadId || initialLeadId
    return leads.find((l) => l.id === id) || null
  }, [leads, initialReport, initialLeadId, isTemplate])

  const photos = useMemo(() => (Array.isArray(lead?.photos) ? lead.photos : []), [lead])

  useEffect(() => {
    if (!open) return
    if (isTemplate) {
      if (initialTemplate) {
        setName(initialTemplate.name || '')
        setTitle(initialTemplate.title || 'Photo Report')
        setSections(
          (initialTemplate.sections || []).length
            ? [...initialTemplate.sections].sort((a, b) => a.order - b.order)
            : [newReportSection(0)]
        )
      } else {
        setName('')
        setTitle('Photo Report')
        setSections([newReportSection(0)])
      }
      return
    }
    if (initialReport) {
      setTitle(initialReport.title || 'Photo Report')
      setSections(
        (initialReport.sections || []).length
          ? [...initialReport.sections].sort((a, b) => a.order - b.order)
          : [newReportSection(0)]
      )
    } else if (layoutTemplate) {
      setTitle(layoutTemplate.title || layoutTemplate.name || 'Photo Report')
      setSections(sectionsFromTemplate(layoutTemplate))
    } else {
      setTitle('Photo Report')
      setSections([newReportSection(0)])
    }
  }, [open, initialReport, initialTemplate, layoutTemplate, isTemplate])

  useEffect(() => {
    if (!open) setPickerSectionId(null)
  }, [open])

  useEffect(() => {
    if (!pickerSectionId) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPickerSectionId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickerSectionId])

  useEffect(() => {
    if (!open || !getToken || isTemplate) return
    photos.forEach(async (p) => {
      if (thumbUrls[p.id]) return
      try {
        const token = await getToken()
        const key = p.thumbnailKey || p.key
        const res = await fetch(leadPhotoUrl(key), { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const blob = await res.blob()
        setThumbUrls((prev) => ({ ...prev, [p.id]: URL.createObjectURL(blob) }))
      } catch { /* ignore */ }
    })
  }, [open, photos, getToken, thumbUrls, isTemplate])

  const addSection = () => {
    setSections((prev) => [...prev, newReportSection(prev.length)])
  }

  const removeSection = (id) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const moveSection = (id, dir) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((s, i) => ({ ...s, order: i }))
    })
  }

  const updateSection = (id, patch) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const togglePhoto = (sectionId, photoId) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const has = s.photoIds.includes(photoId)
        return {
          ...s,
          photoIds: has ? s.photoIds.filter((id) => id !== photoId) : [...s.photoIds, photoId],
        }
      })
    )
  }

  const layoutSectionsPayload = useCallback(
    () =>
      sections.map((s, i) => ({
        subtitle: s.subtitle,
        description: s.description,
        order: i,
      })),
    [sections]
  )

  const handleSaveTemplate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      showToast('Template name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: trimmedName,
        title: title.trim() || 'Photo Report',
        sections: layoutSectionsPayload(),
      }
      let saved
      if (initialTemplate?.id) {
        saved = await updateReportTemplate(getToken, initialTemplate.id, payload)
      } else {
        saved = await createReportTemplate(getToken, payload)
      }
      showToast('Template saved', 'success')
      onSaved?.(saved)
      onClose?.()
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    const templateName = (title || 'Report template').trim()
    setSaving(true)
    try {
      await createReportTemplate(getToken, {
        name: templateName,
        title: title.trim() || 'Photo Report',
        sections: layoutSectionsPayload(),
      })
      showToast('Saved as template', 'success')
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveReport = async () => {
    if (!lead) {
      showToast('Lead is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        leadId: lead.id,
        title: title.trim() || 'Photo Report',
        sections: sections.map((s, i) => ({ ...s, order: i })),
        templateId: layoutTemplate?.id || initialReport?.templateId || null,
      }
      let report
      if (initialReport?.id) {
        report = await updatePhotoReport(getToken, initialReport.id, payload)
      } else {
        report = await createPhotoReport(getToken, payload)
        await logLeadReportEvent(getToken, lead.id, `Photo report created: ${report.title}`, { reportId: report.id })
      }
      showToast('Report saved', 'success')
      onSaved?.(report)
      onClose?.()
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (isTemplate) handleSaveTemplate()
    else handleSaveReport()
  }

  if (!open) return null

  const headerTitle = isTemplate
    ? (initialTemplate ? 'Edit template' : 'New template')
    : (initialReport ? 'Edit report' : 'New report')

  return (
    <>
      <Dialog open={open} modal={false} onOpenChange={(o) => handleChildPanelDismiss(o, onClose, { wasOpen: open })}>
        <DialogContent
          className={cn(
            'map-panel list-panel reports-panel report-editor-panel fullscreen-panel relative flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full',
            !isTemplate && 'square-picker-panel',
          )}
          showCloseButton={false}
          nestedOverlay
          topLayer
        >
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">{headerTitle}</DialogDescription>
            <PanelHeader onBack={onBack ?? onClose} title={headerTitle} />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4 min-h-0" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
            {lead && (
              <div className="text-sm opacity-80">
                <div className="font-medium">{displayLeadName(lead)}</div>
                <div className="text-xs opacity-60">{formatLeadAddress(lead)}</div>
              </div>
            )}

            {isTemplate && (
              <label className="block space-y-1">
                <span className="text-xs font-medium opacity-70">Template name</span>
                <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Roof Inspection Report" />
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-xs font-medium opacity-70">{isTemplate ? 'Default report title' : 'Report title'}</span>
              <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            {sections.map((section, idx) => (
              <div key={section.id} className="report-section-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold opacity-60">Section {idx + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" className="p-1 opacity-60 hover:opacity-100" onClick={() => moveSection(section.id, -1)}><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" className="p-1 opacity-60 hover:opacity-100" onClick={() => moveSection(section.id, 1)}><ChevronDown className="h-4 w-4" /></button>
                    {sections.length > 1 && (
                      <button type="button" className="p-1 opacity-40 hover:opacity-80" onClick={() => removeSection(section.id)}><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                <input
                  className={FIELD}
                  placeholder="Section subtitle"
                  value={section.subtitle}
                  onChange={(e) => updateSection(section.id, { subtitle: e.target.value })}
                />
                <textarea
                  className={`${FIELD} min-h-[80px]`}
                  placeholder="Section description"
                  value={section.description}
                  onChange={(e) => updateSection(section.id, { description: e.target.value })}
                />
                {!isTemplate && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPickerSectionId(section.id)}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                    {section.photoIds.length ? `${section.photoIds.length} photos` : 'Add photos'}
                  </Button>
                )}
              </div>
            ))}

            <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={addSection}>
              <Plus className="h-4 w-4 mr-2" />
              Add section
            </Button>
          </div>

          <div className="sticky bottom-0 border-t border-white/10 px-5 py-3 bg-[var(--map-panel-detail-surface)] space-y-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            <Button type="button" className="w-full min-h-[44px]" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isTemplate ? 'Save template' : 'Save report')}
            </Button>
            {!isTemplate && !initialReport?.id && (
              <Button type="button" variant="outline" className="w-full min-h-[44px]" disabled={saving} onClick={handleSaveAsTemplate}>
                Save as template
              </Button>
            )}
          </div>

          {!isTemplate && pickerSectionId && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/60"
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-photo-picker-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setPickerSectionId(null)
              }}
            >
              <div
                className="w-full max-w-md rounded-xl border border-white/15 bg-[var(--map-panel-detail-surface)] p-4 shadow-xl max-h-[min(85vh,560px)] flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                  <h3 id="report-photo-picker-title" className="text-sm font-semibold">
                    Select photos
                  </h3>
                  <button
                    type="button"
                    className="p-1.5 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10"
                    onClick={() => setPickerSectionId(null)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                  {photos.length === 0 ? (
                    <p className="text-xs opacity-50">No photos on this lead yet.</p>
                  ) : (
                    <div className="lead-photo-grid">
                      {photos.map((p) => {
                        const sec = sections.find((s) => s.id === pickerSectionId)
                        const selected = sec?.photoIds?.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={cn(
                              'aspect-square rounded-lg border overflow-hidden',
                              selected ? 'border-white/40 bg-white/10' : 'border-white/10'
                            )}
                            onClick={() => togglePhoto(pickerSectionId, p.id)}
                          >
                            {thumbUrls[p.id] ? (
                              <img src={thumbUrls[p.id]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-white/5" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  className="w-full mt-3 min-h-[44px] shrink-0"
                  onClick={() => setPickerSectionId(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
