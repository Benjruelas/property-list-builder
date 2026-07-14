import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  MoreVertical,
  Pencil,
  Copy,
  MessageSquare,
  FileText,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { ignoreRadixMapPanelDismiss, mapListDialogOpen, listPanelObscuredByDetail } from '../ui/panelDialogUtils'
import {
  PanelHeader,
  PANEL_LIST_HEADER_CLASS,
  PANEL_LIST_HEADER_STYLE,
  PanelCreateButton,
  PanelOptionsButton,
} from '../ui/panel-header'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { OptionsMenuDropdown, OptionsMenuItem } from '../ui/OptionsMenuDropdown'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  fetchPhotoReports,
  deletePhotoReport,
  fetchReportTemplates,
  createReportTemplate,
  deleteReportTemplate,
  DEFAULT_REPORT_TEMPLATE,
} from '../../utils/photoReports'
import {
  REPORT_SEND_TAGS,
  getReportSendTemplatesFromSettings,
  buildReportSendTemplatesPatch,
  DEFAULT_REPORT_EMAIL_SUBJECT,
  DEFAULT_REPORT_EMAIL_BODY,
  DEFAULT_REPORT_TEXT_BODY,
} from '../../utils/reportSendTemplates'
import { getSettings, updateSettings } from '../../utils/settings'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { clearReportEditorDraft, clearReportEditorDraftForReport } from '../../utils/reportEditorDraft'
import { ReportBuilder } from './ReportBuilder'
import { ReportDetail } from './ReportDetail'
import { ReportTemplatePickerDialog } from './ReportTemplatePickerDialog'
import { LeadPickerDialog } from '../photos/LeadPickerDialog'

const MENU_WIDTH = 180

export function ReportsPanel({
  isOpen,
  retainDuringSwap = false,
  panelDockSlot,
  onClose,
  onBack,
  leads = [],
  editorFrame = null,
  detailReportId = null,
  onOpenEditor,
  onPatchEditor,
  onOpenDetail,
  onCloseEditor,
  onCloseDetail,
  teams = [],
  teamMembership = null,
  quickCreateRequestKey = 0,
  onLeadUpdate,
}) {
  const { getToken } = useAuth()
  const [tab, setTab] = useState('reports')
  const [reports, setReports] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuTriggerRef = useRef(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuTriggerRef = useRef(null)
  const [leadPickerOpen, setLeadPickerOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [pendingReportLeadId, setPendingReportLeadId] = useState(null)
  const [pendingPreferredTemplate, setPendingPreferredTemplate] = useState(null)
  const lastQuickCreateKeyRef = useRef(0)

  const editorOpen = !!editorFrame
  const hasReportDetail = !!detailReportId
  const editorMode = editorFrame?.mode ?? 'report'
  const editorTemplate = editorFrame?.template ?? null
  const editorReport = editorMode === 'report' ? (editorFrame?.report ?? null) : null
  const editorLeadId = editorMode === 'report'
    ? (editorFrame?.leadId || editorReport?.leadId || null)
    : null
  const layoutTemplate = editorMode === 'report' && !editorReport && editorFrame?.awaitingTemplate !== true
    ? (editorFrame?.layoutTemplate ?? editorFrame?.template ?? null)
    : null

  const awaitingTemplatePick = !!(
    editorOpen
    && editorMode === 'report'
    && !editorReport
    && editorLeadId
    && editorFrame?.awaitingTemplate
  )

  const showReportTemplatePicker = templatePickerOpen || awaitingTemplatePick
  const reportBuilderOpen = editorOpen && !showReportTemplatePicker

  const listOpenOpts = {
    showingDetail: reportBuilderOpen || hasReportDetail,
    retainOpen: retainDuringSwap,
    swappingOut: retainDuringSwap,
  }
  const listDialogOpen = mapListDialogOpen(isOpen, listOpenOpts)
  const listObscuredByEditor = listPanelObscuredByDetail(isOpen, reportBuilderOpen, listOpenOpts)
  const listBesideReportDetail = listPanelObscuredByDetail(isOpen, hasReportDetail, listOpenOpts)

  const [msgEmailSubject, setMsgEmailSubject] = useState('')
  const [msgEmailBody, setMsgEmailBody] = useState('')
  const [msgTextBody, setMsgTextBody] = useState('')

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!getToken) return
    if (!silent) setLoading(true)
    try {
      const [r, t] = await Promise.all([
        fetchPhotoReports(getToken),
        fetchReportTemplates(getToken),
      ])
      setReports(Array.isArray(r) ? r : [])
      setTemplates(Array.isArray(t) ? t : [])
    } catch (e) {
      if (!silent) showToast(e.message || 'Failed to load reports', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (!isOpen || !getToken) return
    refresh()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !getToken || (!detailReportId && !editorOpen)) return
    refresh({ silent: true })
  }, [detailReportId, editorOpen])

  useEffect(() => {
    if (!isOpen) {
      setTab('reports')
      setOpenMenuId(null)
      setHeaderMenuOpen(false)
      setLeadPickerOpen(false)
      setTemplatePickerOpen(false)
      setPendingReportLeadId(null)
      setPendingPreferredTemplate(null)
    }
  }, [isOpen])

  useEffect(() => {
    const t = getReportSendTemplatesFromSettings(getSettings())
    setMsgEmailSubject(t.emailSubject)
    setMsgEmailBody(t.emailBody)
    setMsgTextBody(t.textBody)
  }, [isOpen, tab])

  const filteredReports = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return reports
    return reports.filter((r) => {
      const lead = leads.find((l) => l.id === r.leadId)
      const leadName = lead ? displayLeadName(lead).toLowerCase() : ''
      const addr = lead ? (formatLeadAddress(lead) || '').toLowerCase() : ''
      const title = (r.title || '').toLowerCase()
      return [title, leadName, addr].some((s) => s.includes(q))
    })
  }, [reports, search, leads])

  const filteredTemplates = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return templates
    return templates.filter((t) => (t.name || t.title || '').toLowerCase().includes(s))
  }, [templates, search])

  const detailReport = useMemo(
    () => (detailReportId ? reports.find((r) => r.id === detailReportId) : null),
    [reports, detailReportId]
  )

  const detailLead = useMemo(
    () => (detailReport ? leads.find((l) => l.id === detailReport.leadId) : null),
    [detailReport, leads]
  )

  const openNewReport = () => {
    setPendingPreferredTemplate(null)
    setPendingReportLeadId(null)
    setLeadPickerOpen(true)
  }

  useEffect(() => {
    if (!isOpen || !quickCreateRequestKey || quickCreateRequestKey === lastQuickCreateKeyRef.current) return
    lastQuickCreateKeyRef.current = quickCreateRequestKey
    setPendingPreferredTemplate(null)
    setPendingReportLeadId(null)
    setLeadPickerOpen(true)
  }, [isOpen, quickCreateRequestKey])

  const resetReportCreateFlow = () => {
    setLeadPickerOpen(false)
    setTemplatePickerOpen(false)
    setPendingReportLeadId(null)
    setPendingPreferredTemplate(null)
  }

  const openTemplatePickerForLead = (leadId) => {
    setPendingReportLeadId(leadId)
    setTemplatePickerOpen(true)
  }

  const finalizeNewReport = (template) => {
    const leadId = pendingReportLeadId || editorLeadId
    const wasAwaitingTemplate = awaitingTemplatePick
    resetReportCreateFlow()
    if (!leadId) return

    clearReportEditorDraft(leadId)

    if (wasAwaitingTemplate) {
      onPatchEditor?.({
        layoutTemplate: template ?? null,
        awaitingTemplate: false,
      })
      return
    }

    onOpenEditor?.({
      mode: 'report',
      leadId,
      layoutTemplate: template ?? null,
    })
  }

  const templatePickerLead = useMemo(() => {
    const id = pendingReportLeadId || editorLeadId
    return id ? leads.find((l) => l.id === id) : null
  }, [pendingReportLeadId, editorLeadId, leads])

  const openNewTemplate = () => {
    onOpenEditor?.({ mode: 'template' })
    if (templates.length === 0) {
      void (async () => {
        try {
          await createReportTemplate(getToken, DEFAULT_REPORT_TEMPLATE)
          await refresh()
        } catch {
          /* user can still create manually */
        }
      })()
    }
  }

  const performDeleteReport = async (report) => {
    try {
      await deletePhotoReport(getToken, report.id)
      clearReportEditorDraftForReport(report.leadId, report.id)
      if (editorReport?.id === report.id) onCloseEditor?.()
      if (detailReportId === report.id) onCloseDetail?.()
      await refresh()
      showToast('Report deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error')
    }
  }

  const handleDeleteReport = async (report) => {
    const ok = await showConfirm({ title: 'Delete report?', destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    await performDeleteReport(report)
  }

  const handleDeleteTemplate = async (t) => {
    const ok = await showConfirm({
      title: 'Delete template?',
      message: 'This template will be removed. Existing reports are not affected.',
      destructive: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteReportTemplate(getToken, t.id)
      await refresh()
      showToast('Template deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error')
    }
  }

  const saveMessageTemplates = () => {
    const patch = buildReportSendTemplatesPatch({
      emailSubject: msgEmailSubject,
      emailBody: msgEmailBody,
      textBody: msgTextBody,
    })
    updateSettings(patch, getToken)
    showToast('Message templates saved', 'success')
  }

  const resetMessageTemplates = () => {
    setMsgEmailSubject(DEFAULT_REPORT_EMAIL_SUBJECT)
    setMsgEmailBody(DEFAULT_REPORT_EMAIL_BODY)
    setMsgTextBody(DEFAULT_REPORT_TEXT_BODY)
  }

  const handlePanelBack = () => {
    if (editorOpen) {
      onCloseEditor?.()
      return
    }
    if (detailReportId) {
      onCloseDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const openMenu = (id, e) => {
    e.stopPropagation()
    menuTriggerRef.current = e.currentTarget
    setOpenMenuId(id)
  }

  const leadLabel = (report) => {
    const lead = leads.find((l) => l.id === report.leadId)
    return lead ? displayLeadName(lead) : 'Lead'
  }

  return (
    <>
      <Dialog open={listDialogOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
        <DialogContent
          className={cn(
            'map-panel list-panel reports-panel fullscreen-panel flex flex-col min-h-0 p-0',
            listObscuredByEditor && 'crm-list-under-detail',
            listBesideReportDetail && 'reports-list-with-detail',
          )}
          panelDockSlot={panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-reports-panel-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Photo reports</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Reports">
              <PanelCreateButton onClick={openNewReport} title="Create report" />
              <PanelOptionsButton
                ref={headerMenuTriggerRef}
                title="Report options"
                onClick={() => setHeaderMenuOpen(true)}
              />
            </PanelHeader>
          </DialogHeader>

          <OptionsMenuDropdown
            open={headerMenuOpen}
            onClose={() => setHeaderMenuOpen(false)}
            triggerRef={headerMenuTriggerRef}
            menuWidth={MENU_WIDTH}
            dataAttr="data-reports-panel-menu"
          >
            <OptionsMenuItem onClick={() => { setHeaderMenuOpen(false); openNewTemplate() }}>
              <Plus className="h-4 w-4" />
              Create report template
            </OptionsMenuItem>
            <OptionsMenuItem onClick={() => { setHeaderMenuOpen(false); setTab('templates') }}>
              <Copy className="h-4 w-4" />
              Manage templates
            </OptionsMenuItem>
          </OptionsMenuDropdown>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5 min-h-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="mb-3 space-y-2">
              <div className="flex gap-4">
                {[
                  { id: 'reports', label: 'Reports', count: reports.length },
                  { id: 'templates', label: 'Templates', count: templates.length },
                  { id: 'messages', label: 'Messages' },
                ].map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
                      tab === id ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
                    )}
                  >
                    {label}
                    {count != null ? <span className="text-xs opacity-60 ml-1">{count}</span> : null}
                  </button>
                ))}
              </div>

              {tab !== 'messages' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tab === 'templates' ? 'Search templates…' : 'Search reports by title or lead…'}
                    className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                    aria-label={tab === 'templates' ? 'Search templates' : 'Search reports'}
                  />
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin opacity-60" />
              </div>
            ) : tab === 'reports' ? (
              reports.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No reports yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a photo report to document a property for a lead.</p>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">No reports match your search.</p>
                </div>
              ) : (
                filteredReports.map((report) => (
                  <div
                    key={report.id}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer"
                    onClick={() => onOpenDetail?.(report.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenDetail?.(report.id)
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{report.title || 'Photo Report'}</div>
                      <p className="text-sm opacity-70 truncate">{leadLabel(report)}</p>
                      <p className="text-sm opacity-50 capitalize">{report.status || 'draft'}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                      onClick={(e) => openMenu(`r-${report.id}`, e)}
                      aria-label={`Options for ${report.title || 'report'}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )
            ) : tab === 'templates' ? (
              templates.length === 0 ? (
                <div className="text-center py-16">
                  <Copy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No templates yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Save a report layout as a template to reuse section structure on future reports.</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">No templates match your search.</p>
                </div>
              ) : (
                filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="map-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.name || t.title}</p>
                      <p className="text-sm opacity-50">{(t.sections || []).length} sections</p>
                    </div>
                    <button
                      type="button"
                      className="p-2 opacity-60 hover:opacity-100 text-xs"
                      title="New report from template"
                      onClick={() => {
                        setPendingPreferredTemplate(t)
                        setPendingReportLeadId(null)
                        setLeadPickerOpen(true)
                      }}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="p-2 opacity-60 hover:opacity-100"
                      onClick={() => onOpenEditor?.({ mode: 'template', template: t })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="p-2 opacity-60 hover:opacity-100 text-red-400" onClick={() => handleDeleteTemplate(t)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )
            ) : (
              <div className="space-y-4 pb-4">
                <p className="text-sm opacity-70">Default templates used when sending photo reports via email or text. Use {'{ReportLink}'} for the share link — it is filled in automatically when you copy or send. Your name comes from Settings; company name from team branding (Teams → your team).</p>
                <div className="flex flex-wrap gap-1">
                  {REPORT_SEND_TAGS.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10" title={tag}>{tag}</span>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Email subject</span>
                  <Input value={msgEmailSubject} onChange={(e) => setMsgEmailSubject(e.target.value)} className="bg-white/5 border-white/15" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60">Email body</span>
                  <textarea className="w-full min-h-[100px] bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm" value={msgEmailBody} onChange={(e) => setMsgEmailBody(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60">Text message</span>
                  <textarea className="w-full min-h-[80px] bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm" value={msgTextBody} onChange={(e) => setMsgTextBody(e.target.value)} />
                </label>
                <div className="flex gap-2">
                  <Button className="create-list-btn flex-1" onClick={saveMessageTemplates}>Save defaults</Button>
                  <Button variant="outline" onClick={resetMessageTemplates}>Reset</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OptionsMenuDropdown
        open={!!openMenuId}
        onClose={() => setOpenMenuId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
      >
        {(() => {
          const rid = openMenuId?.replace('r-', '')
          const report = reports.find((x) => x.id === rid)
          if (!report) return null
          return (
            <>
              <OptionsMenuItem onClick={() => { onOpenDetail?.(report.id); setOpenMenuId(null) }}>
                <Pencil className="h-4 w-4" /> View
              </OptionsMenuItem>
              <OptionsMenuItem onClick={() => { onOpenEditor?.({ mode: 'report', report }); setOpenMenuId(null) }}>
                <Pencil className="h-4 w-4" /> Edit
              </OptionsMenuItem>
              <OptionsMenuItem destructive onClick={() => { handleDeleteReport(report); setOpenMenuId(null) }}>
                <Trash2 className="h-4 w-4" /> Delete
              </OptionsMenuItem>
            </>
          )
        })()}
      </OptionsMenuDropdown>

      <LeadPickerDialog
        open={leadPickerOpen}
        onClose={resetReportCreateFlow}
        leads={leads}
        title="Select lead for report"
        panelClassName="square-picker-panel"
        nestedOverlay
        onSelectLead={(lead) => {
          setLeadPickerOpen(false)
          openTemplatePickerForLead(lead.id)
        }}
      />

      <ReportTemplatePickerDialog
        open={showReportTemplatePicker}
        onOpenChange={(open) => {
          if (open) return
          if (awaitingTemplatePick) {
            onCloseEditor?.()
            return
          }
          const hadPendingLead = pendingReportLeadId != null
          setTemplatePickerOpen(false)
          if (!hadPendingLead) return
          setPendingReportLeadId(null)
          setPendingPreferredTemplate(null)
          setLeadPickerOpen(true)
        }}
        templates={templates}
        preferredTemplateId={pendingPreferredTemplate?.id ?? null}
        leadLabel={templatePickerLead ? displayLeadName(templatePickerLead) : ''}
        onSelect={finalizeNewReport}
      />

      <ReportDetail
        open={!!detailReportId && !!detailReport && !editorOpen}
        report={detailReport}
        lead={detailLead}
        getToken={getToken}
        leads={leads}
        teams={teams}
        teamMembership={teamMembership}
        onClose={onCloseDetail}
        onBack={onCloseDetail}
        onEdit={(r) => onOpenEditor?.({ mode: 'report', report: r })}
        onDelete={performDeleteReport}
        onReportUpdated={(r) => {
          setReports((prev) => prev.map((x) => (x.id === r.id ? r : x)))
        }}
      />

      <ReportBuilder
        open={reportBuilderOpen}
        mode={editorMode}
        report={editorReport}
        template={editorMode === 'template' ? editorTemplate : null}
        layoutTemplate={layoutTemplate}
        leadId={editorLeadId}
        leads={leads}
        teams={teams}
        teamMembership={teamMembership}
        getToken={getToken}
        onClose={onCloseEditor}
        onBack={onCloseEditor}
        onLeadUpdate={onLeadUpdate}
        onSaved={(saved, options = {}) => {
          if (editorMode === 'template') {
            refresh()
            onCloseEditor?.()
            return
          }
          setReports((prev) => {
            const idx = prev.findIndex((r) => r.id === saved.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = saved
              return next
            }
            return [saved, ...prev]
          })
          if (options.keepOpen) {
            onPatchEditor?.({ report: saved, leadId: saved.leadId, awaitingTemplate: false })
          } else {
            onCloseEditor?.()
          }
        }}
      />
    </>
  )
}
