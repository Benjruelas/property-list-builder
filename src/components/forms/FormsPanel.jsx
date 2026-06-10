import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { X, FileText, Trash2, Edit3, Upload, Loader2, MoreVertical, Share2, Users, Link2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { useAuth } from '../../contexts/AuthContext'
import { LeadSharingIcon } from '../ResourceSharePicker'
import { ShareResourceDialog } from '../ShareResourceDialog'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import {
  fetchTemplates,
  createTemplate,
  deleteTemplate,
  uploadFormPdf
} from '../../utils/forms'

const FormBuilderView = lazy(() => import('./FormBuilderView'))
const FormFillView = lazy(() => import('./FormFillView'))
import { SendFormLinkDialog } from './SendFormLinkDialog'

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
  onClose,
  onBack,
  formsView = 'list',
  formsTemplateId = null,
  onOpenEdit,
  onOpenFill,
  onCloseSubView,
  teams = [],
  teamMembership = null,
  onShareForm,
  onShareFormWithTeams,
  onValidateShareEmail
}) {
  const { getToken, currentUser } = useAuth()
  const view = formsView
  const activeTemplateId = formsTemplateId
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchor, setMenuAnchor] = useState(null)

  // Share dialog state
  const [shareTemplateId, setShareTemplateId] = useState(null)
  const [localShareState, setLocalShareState] = useState(null)
  const [linkTemplateId, setLinkTemplateId] = useState(null)
  const [linkPrefillValues, setLinkPrefillValues] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const validateTimeoutRef = useRef(null)
  const closeMenu = useCallback(() => {
    setOpenMenuId(null)
    setMenuAnchor(null)
  }, [])
  const openMenu = useCallback((templateId, event) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const MENU_WIDTH = 180
    const PADDING = 8
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < PADDING) left = PADDING
    if (left + MENU_WIDTH > window.innerWidth - PADDING) {
      left = window.innerWidth - MENU_WIDTH - PADDING
    }
    const estimatedHeight = 120
    if (top + estimatedHeight > window.innerHeight - PADDING) {
      top = Math.max(PADDING, rect.top - estimatedHeight - 4)
    }
    setMenuAnchor({ top, left })
    setOpenMenuId(templateId)
  }, [])

  const refresh = useCallback(async () => {
    if (!getToken) return
    setLoading(true)
    try {
      const list = await fetchTemplates(getToken)
      setTemplates(list)
    } catch (e) {
      showToast(e.message || 'Failed to load form templates', 'error')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (isOpen && view === 'list') refresh()
  }, [isOpen, view, refresh])

  useEffect(() => {
    if (!isOpen) {
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

  // Debounced email validation for the share dialog.
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
          pageCount
        })
        const { key, url } = await uploadFormPdf(getToken, {
          templateId: created.id,
          file: buf
        })
        const { updateTemplate } = await import('../../utils/forms')
        const updated = await updateTemplate(getToken, created.id, {
          originalPdfKey: key,
          originalPdfUrl: url,
          pageCount
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
  }, [getToken])

  const handleDelete = useCallback(async (template) => {
    const ok = await showConfirm({
      title: 'Delete form template?',
      message: `"${template.name}" will be permanently removed.`,
      confirmLabel: 'Delete'
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
    [currentUser]
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
  }, [shareTemplateId])

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || null,
    [templates, activeTemplateId]
  )

  const linkTemplate = useMemo(
    () => templates.find((t) => t.id === linkTemplateId) || null,
    [templates, linkTemplateId]
  )

  const handleTemplateUpdated = useCallback((updated) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  if (!isOpen) return null

  const handlePanelBack = () => {
    if (view !== 'list') {
      onCloseSubView?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const handleSubViewBack = () => {
    onCloseSubView?.()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handlePanelBack() }}>
      <DialogContent
        className={`map-panel fullscreen-panel p-0 flex flex-col max-w-none w-screen h-screen md:w-[95vw] md:h-[92vh] md:rounded-lg ${view === 'list' ? 'list-panel md:!w-auto md:!max-w-5xl' : ''}`}
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          if (e.target.closest?.('[data-forms-panel-dropdown]')) e.preventDefault()
        }}
      >
        {view === 'list' && (
          <>
            <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
              <DialogDescription className="sr-only">Create, open, fill, or delete your form templates.</DialogDescription>
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
              className="px-6 py-4 overflow-y-auto flex-1"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {loading && templates.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm opacity-70">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading templates…
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-60" />
                  <p className="text-sm opacity-80">No form templates yet.</p>
                  <p className="text-xs opacity-60 mt-1">Upload a PDF to get started.</p>
                  <Button className="mt-4" onClick={handleNewForm} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-2" /> Upload PDF
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                  {templates.map((t) => {
                    const owned = isOwnedByUser(t)
                    const sharedEmails = t.sharedWith || []
                    const norm = normalizeResourceVisibility(t)
                    const hasShares = sharedEmails.length > 0 || norm.visibility !== VISIBILITY.PRIVATE
                    return (
                      <div
                        key={t.id}
                        onClick={() => onOpenFill?.(t.id)}
                        className="map-panel-list-item relative w-full sm:w-auto rounded-lg p-4 transition-all cursor-pointer border border-white/10 bg-white/[0.06] hover:bg-white/[0.1]"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="h-5 w-5 flex-shrink-0 mt-0.5 opacity-80" />
                          <div className="pr-8">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-sm whitespace-nowrap">{t.name}</div>
                              <LeadSharingIcon resource={t} collaboratorHint={!owned} />
                            </div>
                            <div className="text-xs opacity-70 mt-0.5">
                              {t.pageCount || 0} page{(t.pageCount || 0) === 1 ? '' : 's'}
                              {' · '}
                              {(t.fields || []).length} field{(t.fields || []).length === 1 ? '' : 's'}
                            </div>
                            <div className="text-xs opacity-60 mt-0.5 tabular-nums">
                              Last used {formatDate(t.lastUsedAt || t.updatedAt)}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (openMenuId === t.id) {
                              closeMenu()
                            } else {
                              openMenu(t.id, e)
                            }
                          }}
                          title="Form options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {view === 'edit' && activeTemplate && (
          <Suspense fallback={<LoadingScreen label="Loading form builder…" />}>
            <FormBuilderView
              template={activeTemplate}
              onBack={handleSubViewBack}
              onTemplateUpdated={handleTemplateUpdated}
            />
          </Suspense>
        )}

        {view === 'fill' && activeTemplate && (
          <Suspense fallback={<LoadingScreen label="Loading form…" />}>
            <FormFillView
              template={activeTemplate}
              onBack={() => {
                onCloseSubView?.()
                refresh()
              }}
              onTemplateUpdated={handleTemplateUpdated}
              onRequestCompletion={(prefillValues) => {
                setLinkTemplateId(activeTemplate.id)
                setLinkPrefillValues(prefillValues || null)
              }}
            />
          </Suspense>
        )}
      </DialogContent>

      {openMenuId && menuAnchor && typeof document !== 'undefined' && createPortal(
        (() => {
          const t = templates.find((x) => x.id === openMenuId)
          if (!t) return null
          const owned = isOwnedByUser(t)
          return (
            <div
              data-forms-panel-dropdown
              className="pointer-events-auto"
              style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
            >
              <div
                className="fixed inset-0 z-[10001]"
                onClick={closeMenu}
                aria-hidden
              />
              <div
                className="map-panel list-panel fixed z-[10002] rounded-xl min-w-[180px] pt-1 overflow-hidden"
                style={{ top: menuAnchor.top, left: menuAnchor.left }}
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                {owned && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      onOpenEdit?.(t.id)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                  >
                    <Edit3 className="h-4 w-4 flex-shrink-0" />
                    Edit
                  </button>
                )}
                {owned && onShareForm && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      setShareTemplateId(t.id)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                  >
                    <Share2 className="h-4 w-4 flex-shrink-0" />
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeMenu()
                    setLinkTemplateId(t.id)
                    setLinkPrefillValues(null)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                >
                  <Link2 className="h-4 w-4 flex-shrink-0" />
                  Send link
                </button>
                {owned ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { closeMenu(); handleDelete(t) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { closeMenu(); handleDelete(t) } }}
                    className="list-panel-delete-btn w-full px-3 py-2 pb-2 rounded-b-xl text-left text-sm flex items-center gap-2 transition-colors text-red-400 hover:bg-red-600/80 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 flex-shrink-0" />
                    Delete
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-gray-500 italic">
                    Shared form — only the owner can edit or delete.
                  </div>
                )}
              </div>
            </div>
          )
        })(),
        document.getElementById('modal-root') || document.body
      )}

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

      <SendFormLinkDialog
        open={!!linkTemplateId}
        template={linkTemplate}
        prefillValues={linkPrefillValues}
        onClose={() => {
          setLinkTemplateId(null)
          setLinkPrefillValues(null)
        }}
      />
    </Dialog>
  )
}

function LoadingScreen({ label }) {
  return (
    <div className="flex items-center justify-center flex-1 py-20 text-sm text-gray-500">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" /> {label}
    </div>
  )
}

export default FormsPanel
