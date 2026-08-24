import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import {
  FileText,
  Trash2,
  Edit3,
  Upload,
  Loader2,
  MoreVertical,
  Share2,
  Link2,
  Eye,
  Search,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { ignoreRadixMapPanelDismiss, mapListDialogOpen, listPanelObscuredByDetail } from '../ui/panelDialogUtils'
import {
  PanelHeader,
  PANEL_LIST_HEADER_CLASS,
  PANEL_LIST_HEADER_STYLE,
  PanelCreateButton,
} from '../ui/panel-header'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { useAuth } from '../../contexts/AuthContext'
import { LeadSharingIcon } from '../ResourceSharePicker'
import { ShareResourceDialog } from '../ShareResourceDialog'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { OptionsMenuDropdown, OptionsMenuItem } from '../ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import {
  fetchTemplates,
  createTemplate,
  deleteTemplate,
  uploadFormPdf,
  fetchFormPdfBlob,
  downloadFormPdf,
  bytesToBase64,
  fetchFormSubmissions,
} from '../../utils/forms'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { SendFormDialog } from './SendFormDialog'
import { FormCompletedView } from './FormCompletedView'
import { buildFormPrefillFromLead } from '@/utils/formLeadPrefill'
import { resolveLeadCustomFields } from '@/utils/customFields'
import { getSettings } from '@/utils/settings'

const FormBuilderView = lazy(() => import('./FormBuilderView'))
const FormFillView = lazy(() => import('./FormFillView'))

const MENU_WIDTH = 180
const FORM_SUB_PANEL_CLASS =
  'map-panel forms-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full max-md:max-w-none'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return '—'
  }
}

async function readFileAsArrayBuffer(file) {
  return await file.arrayBuffer()
}

async function getPdfPageCount(arrayBuffer) {
  const mod = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  mod.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await mod.getDocument({ data: arrayBuffer.slice(0) }).promise
  const n = doc.numPages
  try { doc.destroy() } catch { /* ignore */ }
  return n
}

export function FormsPanel({
  isOpen,
  isFormsListOpen = true,
  isFormsDetailStandalone = false,
  formsFillOverLead = false,
  panelDockSlot,
  onClose,
  onBack,
  formsView = 'list',
  formsTemplateId = null,
  formsFillLeadId = null,
  formsFillReturnToLead = false,
  formsEditReturnToFormPicker = false,
  lead = null,
  leads = [],
  onOpenEdit,
  onOpenFill,
  onCloseSubView,
  onCloseSubViewFromLead,
  teams = [],
  teamMembership = null,
  onShareForm,
  onShareFormWithTeams,
  onValidateShareEmail,
  onFormSent,
}) {
  const { getToken, currentUser } = useAuth()
  const view = formsView
  const activeTemplateId = formsTemplateId
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuTriggerRef = useRef(null)
  const hasNestedView = view !== 'list'
  // Match reports: standalone fill/edit (including from a Lead) uses primary detail chrome.
  const formsSubViewPrimaryDetail = isFormsDetailStandalone
  const listDialogOpen = mapListDialogOpen(isOpen && isFormsListOpen)
  const listObscuredByDetail = listPanelObscuredByDetail(isOpen && isFormsListOpen, hasNestedView)

  const [shareTemplateId, setShareTemplateId] = useState(null)
  const [localShareState, setLocalShareState] = useState(null)
  const [linkTemplateId, setLinkTemplateId] = useState(null)
  const [linkPrefillValues, setLinkPrefillValues] = useState(null)
  const [completedTemplateId, setCompletedTemplateId] = useState(null)
  const [completedItems, setCompletedItems] = useState([])
  const [completedLoading, setCompletedLoading] = useState(false)
  const [previewSubmission, setPreviewSubmission] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const validateTimeoutRef = useRef(null)

  const handlePreviewTemplate = useCallback((template) => {
    if (!template?.originalPdfKey) {
      showToast('This form has no PDF to preview', 'error')
      return
    }
    setPreviewTemplate(template)
  }, [])

  const openCompletedForTemplate = useCallback(async (template) => {
    if (!template?.id) return
    setCompletedTemplateId(template.id)
    setCompletedLoading(true)
    setCompletedItems([])
    try {
      const data = await fetchFormSubmissions(getToken, template.id)
      setCompletedItems(data.submissions || [])
    } catch (e) {
      showToast(e.message || 'Failed to load completed forms', 'error')
      setCompletedTemplateId(null)
    } finally {
      setCompletedLoading(false)
    }
  }, [getToken])

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!getToken) return
    if (!silent) setLoading(true)
    try {
      const list = await fetchTemplates(getToken)
      setTemplates(list)
    } catch (e) {
      if (!silent) showToast(e.message || 'Failed to load form templates', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (!isOpen || !getToken) return
    refresh()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !getToken || view === 'list') return
    refresh({ silent: true })
  }, [view])

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setOpenMenuId(null)
      setShareTemplateId(null)
      setLocalShareState(null)
      setLinkTemplateId(null)
      setShareEmail('')
      setShareEmailValid(null)
      setShareEmailError('')
      setIsValidatingShare(false)
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
        validateTimeoutRef.current = null
      }
    }
  }, [isOpen])

  const runValidation = useCallback(async (email) => {
    const trimmed = (email || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      return
    }
    if (!onValidateShareEmail) {
      setShareEmailValid(true)
      setShareEmailError('')
      return
    }
    setIsValidatingShare(true)
    setShareEmailError('')
    try {
      const { valid } = await onValidateShareEmail(trimmed)
      setShareEmailValid(valid)
      setShareEmailError(valid ? '' : 'No user found with this email')
    } catch {
      setShareEmailValid(false)
      setShareEmailError('Could not validate email')
    } finally {
      setIsValidatingShare(false)
    }
  }, [onValidateShareEmail])

  useEffect(() => {
    if (!shareTemplateId) return
    const trimmed = (shareEmail || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
        validateTimeoutRef.current = null
      }
      return
    }
    if (validateTimeoutRef.current) clearTimeout(validateTimeoutRef.current)
    validateTimeoutRef.current = setTimeout(() => {
      runValidation(trimmed)
    }, 400)
    return () => {
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
        validateTimeoutRef.current = null
      }
    }
  }, [shareTemplateId, shareEmail, runValidation])

  const handleNewForm = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 4 * 1024 * 1024) {
        showToast('PDF is too large. Please use a file under 4 MB.', 'error')
        return
      }
      setUploading(true)
      try {
        const buf = await readFileAsArrayBuffer(file)
        const pageCount = await getPdfPageCount(buf)
        const baseName = file.name.replace(/\.pdf$/i, '').slice(0, 80) || 'Untitled form'
        const created = await createTemplate(getToken, {
          name: baseName,
          fields: [],
          pageCount,
        })
        const { key, url } = await uploadFormPdf(getToken, {
          templateId: created.id,
          file: buf,
        })
        const { updateTemplate } = await import('../../utils/forms')
        const updated = await updateTemplate(getToken, created.id, {
          originalPdfKey: key,
          originalPdfUrl: url,
          pageCount,
        })
        setTemplates((prev) => [...prev.filter((t) => t.id !== updated.id), updated])
        onOpenEdit?.(updated.id)
        showToast('Form created. Add fields, then save.', 'success')
      } catch (e) {
        showToast(e.message || 'Failed to create form', 'error')
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }, [getToken, onOpenEdit])

  const handleDelete = useCallback(async (template) => {
    const ok = await showConfirm({
      title: 'Delete form template?',
      message: `"${template.name}" will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteTemplate(getToken, template.id)
      setTemplates((prev) => prev.filter((t) => t.id !== template.id))
      showToast('Form template deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to delete template', 'error')
    }
  }, [getToken])

  const isOwnedByUser = useCallback(
    (template) => !!(template && currentUser && template.ownerId === currentUser.uid),
    [currentUser],
  )

  const handleShareSave = useCallback(async () => {
    if (!shareTemplateId || !onShareForm) return
    const email = shareEmail.trim().toLowerCase()
    if (!email) {
      showToast('Please enter an email', 'error')
      return
    }
    if (shareEmailValid === false) {
      showToast('No user found with this email', 'error')
      return
    }
    if (shareEmailValid !== true && onValidateShareEmail) {
      showToast('Please wait for email validation', 'error')
      return
    }
    const template = templates.find((t) => t.id === shareTemplateId)
    const current = template?.sharedWith || []
    if (current.some((e) => (e || '').toLowerCase() === email)) {
      showToast('This email is already in the share list', 'error')
      return
    }
    try {
      const next = [...current, email]
      const updated = await onShareForm(shareTemplateId, next)
      if (updated) {
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      } else {
        await refresh()
      }
      setShareEmail('')
      setShareEmailValid(null)
      setShareEmailError('')
    } catch {
      /* error toast shown by caller */
    }
  }, [shareTemplateId, shareEmail, shareEmailValid, onShareForm, onValidateShareEmail, templates, refresh])

  const handleRemoveSharedEmail = useCallback(async (emailToRemove) => {
    if (!shareTemplateId || !onShareForm) return
    const template = templates.find((t) => t.id === shareTemplateId)
    const current = template?.sharedWith || []
    const updated = current.filter((e) => (e || '').toLowerCase() !== (emailToRemove || '').toLowerCase())
    try {
      const result = await onShareForm(shareTemplateId, updated)
      if (result) {
        setTemplates((prev) => prev.map((t) => (t.id === result.id ? result : t)))
      } else {
        await refresh()
      }
    } catch {
      /* error toast shown by caller */
    }
  }, [shareTemplateId, onShareForm, templates, refresh])

  const handleToggleTeamShare = useCallback(async (sharePatch) => {
    if (!shareTemplateId || !onShareFormWithTeams) return
    setLocalShareState(sharePatch)
    try {
      const updated = await onShareFormWithTeams(shareTemplateId, sharePatch)
      if (updated) {
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      } else {
        await refresh()
      }
    } catch (e) {
      const template = templates.find((t) => t.id === shareTemplateId)
      const norm = normalizeResourceVisibility(template || {})
      setLocalShareState({
        visibility: norm.visibility || VISIBILITY.PRIVATE,
        sharedMemberUids: norm.sharedMemberUids || [],
      })
      showToast(e.message || 'Failed to update sharing', 'error')
    }
  }, [shareTemplateId, onShareFormWithTeams, templates, refresh])

  useEffect(() => {
    if (!shareTemplateId) {
      setLocalShareState(null)
      return
    }
    const template = templates.find((t) => t.id === shareTemplateId)
    const norm = normalizeResourceVisibility(template || {})
    setLocalShareState({
      visibility: norm.visibility || VISIBILITY.PRIVATE,
      sharedMemberUids: norm.sharedMemberUids || [],
    })
  }, [shareTemplateId, templates])

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || null,
    [templates, activeTemplateId],
  )

  const linkTemplate = useMemo(
    () => templates.find((t) => t.id === linkTemplateId) || null,
    [templates, linkTemplateId],
  )

  const filteredTemplates = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return templates
    return templates.filter((t) => (t.name || '').toLowerCase().includes(s))
  }, [templates, search])

  const handleTemplateUpdated = useCallback((updated) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  const openMenu = (id, e) => {
    e.stopPropagation()
    menuTriggerRef.current = e.currentTarget
    setOpenMenuId(id)
  }

  const handlePanelBack = () => {
    if (view !== 'list') {
      onCloseSubView?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const handleSubViewBack = () => {
    if (formsEditReturnToFormPicker && view === 'edit') {
      onCloseSubViewFromLead?.()
      return
    }
    onCloseSubView?.()
  }

  return (
    <>
      <Dialog open={listDialogOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
        <DialogContent
          className={cn(
            'map-panel list-panel forms-panel fullscreen-panel flex flex-col min-h-0 p-0',
            listObscuredByDetail && 'crm-list-under-detail',
          )}
          panelDockSlot={panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-forms-panel-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Forms</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Forms">
              <PanelCreateButton
                onClick={handleNewForm}
                title="New form"
                disabled={uploading}
                loading={uploading}
              />
            </PanelHeader>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5 min-h-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search forms by name…"
                  className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                  aria-label="Search forms"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin opacity-60" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No forms yet.</p>
                <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Upload a PDF to create a fillable form template.</p>
                <Button className="mt-4 create-list-btn" onClick={handleNewForm} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" /> Upload PDF
                </Button>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">No forms match your search.</p>
              </div>
            ) : (
              filteredTemplates.map((t) => {
                const owned = isOwnedByUser(t)
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer"
                    onClick={() => onOpenFill?.(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenFill?.(t.id)
                      }
                    }}
                  >
                    <FileText className="h-5 w-5 shrink-0 opacity-70" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{t.name}</span>
                        <LeadSharingIcon resource={t} collaboratorHint={!owned} />
                      </div>
                      <p className="text-sm opacity-70 truncate">
                        {t.pageCount || 0} page{(t.pageCount || 0) === 1 ? '' : 's'}
                        {' · '}
                        {(t.fields || []).length} field{(t.fields || []).length === 1 ? '' : 's'}
                      </p>
                      <p className="text-sm opacity-50">Last used {formatDate(t.lastUsedAt || t.updatedAt)}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                      onClick={(e) => openMenu(`f-${t.id}`, e)}
                      aria-label={`Options for ${t.name}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OptionsMenuDropdown
        open={!!openMenuId}
        onClose={() => setOpenMenuId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-forms-panel-menu"
      >
        {(() => {
          const tid = openMenuId?.replace('f-', '')
          const t = templates.find((x) => x.id === tid)
          if (!t) return null
          const owned = isOwnedByUser(t)
          return (
            <>
              <OptionsMenuItem onClick={() => { handlePreviewTemplate(t); setOpenMenuId(null) }}>
                <Eye className="h-4 w-4" /> Preview PDF
              </OptionsMenuItem>
              <OptionsMenuItem onClick={() => { openCompletedForTemplate(t); setOpenMenuId(null) }}>
                <FileText className="h-4 w-4" /> Completed
              </OptionsMenuItem>
              {owned && (
                <OptionsMenuItem onClick={() => { onOpenEdit?.(t.id); setOpenMenuId(null) }}>
                  <Edit3 className="h-4 w-4" /> Edit
                </OptionsMenuItem>
              )}
              {owned && onShareForm && (
                <OptionsMenuItem onClick={() => { setShareTemplateId(t.id); setOpenMenuId(null) }}>
                  <Share2 className="h-4 w-4" /> Share
                </OptionsMenuItem>
              )}
              <OptionsMenuItem onClick={() => { setLinkTemplateId(t.id); setLinkPrefillValues(null); setOpenMenuId(null) }}>
                <Link2 className="h-4 w-4" /> Send
              </OptionsMenuItem>
              {owned ? (
                <OptionsMenuItem destructive onClick={() => { handleDelete(t); setOpenMenuId(null) }}>
                  <Trash2 className="h-4 w-4" /> Delete
                </OptionsMenuItem>
              ) : (
                <div className="px-3 py-2 text-xs opacity-50 italic">
                  Shared form — only the owner can edit or delete.
                </div>
              )}
            </>
          )
        })()}
      </OptionsMenuDropdown>

      <Dialog
        open={view === 'edit'}
        modal={false}
        onOpenChange={(open) => { if (!open) handleSubViewBack() }}
      >
        <DialogContent
          className={cn(FORM_SUB_PANEL_CLASS, 'form-editor-panel')}
          showCloseButton={false}
          nestedOverlay={!formsSubViewPrimaryDetail}
          topLayer
          hideOverlay={formsSubViewPrimaryDetail}
          suppressBackdrop={formsSubViewPrimaryDetail}
          panelDockSlot={formsFillOverLead ? panelDockSlot : undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Edit form</DialogTitle>
            <DialogDescription>Place and configure fields on a form template</DialogDescription>
          </DialogHeader>
          {activeTemplate ? (
            <Suspense fallback={<LoadingScreen label="Loading form builder…" />}>
              <FormBuilderView
                template={activeTemplate}
                onBack={handleSubViewBack}
                onTemplateUpdated={handleTemplateUpdated}
                teams={teams}
                teamMembership={teamMembership}
              />
            </Suspense>
          ) : (
            <LoadingScreen label="Loading form…" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={view === 'fill'}
        modal={false}
        onOpenChange={(open) => {
          if (!open) handleSubViewBack()
        }}
      >
        <DialogContent
          className={cn(FORM_SUB_PANEL_CLASS, 'form-fill-panel')}
          showCloseButton={false}
          nestedOverlay={!formsSubViewPrimaryDetail}
          topLayer
          hideOverlay={formsSubViewPrimaryDetail}
          suppressBackdrop={formsSubViewPrimaryDetail}
          panelDockSlot={formsFillOverLead ? panelDockSlot : undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Fill form</DialogTitle>
            <DialogDescription>Complete and send a form</DialogDescription>
          </DialogHeader>
          {activeTemplate ? (
            <Suspense fallback={<LoadingScreen label="Loading form…" />}>
              <FormFillView
                template={activeTemplate}
                onBack={handleSubViewBack}
                lead={lead}
                leads={leads}
                initialValues={lead ? buildFormPrefillFromLead(
                  activeTemplate.fields || [],
                  lead,
                  resolveLeadCustomFields({ settings: getSettings(), teams, teamMembership }),
                ) : undefined}
                onFormSent={onFormSent}
                teams={teams}
                teamMembership={teamMembership}
              />
            </Suspense>
          ) : (
            <LoadingScreen label="Loading form…" />
          )}
        </DialogContent>
      </Dialog>

      {shareTemplateId && (() => {
        const template = templates.find((t) => t.id === shareTemplateId)
        const shareState = localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
        const activeTeam = teams?.[0] || null
        const allowExternalSharing = teamMembership?.allowExternalSharing === true
        const closeShareForm = () => {
          setShareTemplateId(null)
          setShareEmail('')
          setShareEmailValid(null)
          setShareEmailError('')
        }
        return (
          <ShareResourceDialog
            open={!!shareTemplateId}
            onOpenChange={(open) => { if (!open) closeShareForm() }}
            title="Share form"
            intro="Recipients can view and fill this form. Only you can edit or delete it."
            team={activeTeam}
            showTeamPicker={Boolean(onShareFormWithTeams && activeTeam)}
            shareState={shareState}
            onShareStateChange={handleToggleTeamShare}
            allowExternalSharing={allowExternalSharing}
            sharedWithEmails={template?.sharedWith || []}
            onRemoveSharedEmail={handleRemoveSharedEmail}
            shareEmail={shareEmail}
            onShareEmailChange={setShareEmail}
            shareEmailValid={shareEmailValid}
            shareEmailError={shareEmailError}
            isValidatingShare={isValidatingShare}
            onShareEmailSave={handleShareSave}
            secondaryLabel="Close"
          />
        )
      })()}

      <SendFormDialog
        open={!!linkTemplateId}
        template={linkTemplate}
        prefillValues={linkPrefillValues}
        lead={lead}
        leads={leads}
        teams={teams}
        teamMembership={teamMembership}
        initialDelivery="link"
        preparePdf={linkTemplate?.originalPdfKey ? async () => {
          const buf = await downloadFormPdf(getToken, linkTemplate.originalPdfKey)
          return bytesToBase64(new Uint8Array(buf))
        } : null}
        onClose={() => {
          setLinkTemplateId(null)
          setLinkPrefillValues(null)
        }}
        onSent={() => {
          setLinkTemplateId(null)
          setLinkPrefillValues(null)
        }}
      />

      <FilePreviewOverlay
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        items={previewTemplate ? [{
          id: previewTemplate.id,
          name: `${previewTemplate.name || 'Form'}.pdf`,
          contentType: 'application/pdf',
          loadBlob: () => fetchFormPdfBlob(getToken, previewTemplate.originalPdfKey),
        }] : []}
        initialIndex={0}
      />

      <Dialog
        open={!!previewSubmission?.pdfKey}
        modal={false}
        onOpenChange={(open) => { if (!open) setPreviewSubmission(null) }}
      >
        <DialogContent
          className={cn(FORM_SUB_PANEL_CLASS, 'form-fill-panel')}
          showCloseButton={false}
          topLayer
          hideOverlay
          suppressBackdrop
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Completed form</DialogTitle>
            <DialogDescription>View completed form PDF</DialogDescription>
          </DialogHeader>
          {previewSubmission?.pdfKey ? (
            <FormCompletedView
              title={previewSubmission.templateName || 'Completed form'}
              fileName={`${previewSubmission.templateName || 'Form'}-completed.pdf`}
              pdfKey={previewSubmission.pdfKey}
              submissionId={previewSubmission.id}
              onBack={() => setPreviewSubmission(null)}
              onDeleted={() => setPreviewSubmission(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!completedTemplateId}
        onOpenChange={(open) => { if (!open) setCompletedTemplateId(null) }}
      >
        <DialogContent
          className="map-panel list-panel max-w-md"
          showCloseButton
          topLayer
          confirmLayer
        >
          <DialogHeader>
            <DialogTitle>Completed forms</DialogTitle>
            <DialogDescription>
              {templates.find((t) => t.id === completedTemplateId)?.name || 'Form'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-hide py-2">
            {completedLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin opacity-60" />
              </div>
            ) : completedItems.length === 0 ? (
              <p className="text-sm opacity-60 text-center py-6">No completed submissions yet.</p>
            ) : (
              completedItems.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className="w-full text-left p-3 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50"
                  disabled={!sub.hasPdf}
                  onClick={() => {
                    if (!sub.hasPdf) {
                      showToast('Completed PDF is not available for this submission', 'error')
                      return
                    }
                    setPreviewSubmission({
                      ...sub,
                      templateName: templates.find((t) => t.id === completedTemplateId)?.name,
                    })
                    setCompletedTemplateId(null)
                  }}
                >
                  <div className="text-sm font-medium truncate">
                    {sub.leadName || sub.recipientEmail || sub.submitterEmail || 'Submission'}
                  </div>
                  <div className="text-xs opacity-60 mt-0.5">
                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}
                    {sub.hasPdf ? '' : ' · PDF unavailable'}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LoadingScreen({ label }) {
  return (
    <div className="flex items-center justify-center flex-1 py-20 text-sm opacity-60">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" /> {label}
    </div>
  )
}

export default FormsPanel
