import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Edit2, Trash2, Mail, MessageSquare, Send, ArrowLeft, MoreVertical, Share2, Download, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import {
  getEmailTemplates,
  addEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  AVAILABLE_TAGS,
  serializeEmailTemplateForShare,
  importEmailTemplateFromShareJson,
} from '../utils/emailTemplates'
import {
  getTextTemplates,
  addTextTemplate,
  updateTextTemplate,
  deleteTextTemplate,
  serializeTextTemplateForShare,
  importTextTemplateFromShareJson,
} from '../utils/textTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

const MENU_WIDTH = 200

function useOutreachMenu(isPanelOpen) {
  const [openId, setOpenId] = useState(null)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeMenu = useCallback(() => {
    setOpenId(null)
    setMenuAnchor(null)
  }, [])
  const openMenu = useCallback((id, e) => {
    e.stopPropagation()
    if (openId === id) {
      closeMenu()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const PADDING = 8
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < PADDING) left = PADDING
    if (left + MENU_WIDTH > window.innerWidth - PADDING) {
      left = window.innerWidth - MENU_WIDTH - PADDING
    }
    const h = 180
    if (top + h > window.innerHeight - PADDING) {
      top = Math.max(PADDING, rect.top - h - 4)
    }
    setMenuAnchor({ top, left })
    setOpenId(id)
  }, [openId, closeMenu])
  useEffect(() => {
    if (!isPanelOpen) closeMenu()
  }, [isPanelOpen, closeMenu])
  useEffect(() => {
    if (!openId) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, closeMenu])
  return { openId, menuAnchor, openMenu, closeMenu }
}

function TemplateMenuDropdown({ openId, menuAnchor, templates, onClose, onEdit, onShare, onDelete }) {
  const template = openId && Array.isArray(templates) ? templates.find((t) => t.id === openId) : null
  if (!openId || !template || !menuAnchor) return null
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-auto" data-outreach-template-menu>
      <div className="fixed inset-0 z-[10000]" onClick={onClose} aria-hidden />
      <div
        className="map-panel list-panel hamburger-menu fixed z-[10001] min-w-[180px] max-w-[220px] rounded-xl py-1 overflow-hidden border border-white/15 bg-black/90 backdrop-blur-sm shadow-lg"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => { onEdit(template); onClose() }}
          className="hamburger-menu-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2"
        >
          <Edit2 className="h-4 w-4 flex-shrink-0" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => { onShare(template); onClose() }}
          className="hamburger-menu-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2"
        >
          <Share2 className="h-4 w-4 flex-shrink-0" />
          Share
        </button>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { onDelete(template.id); onClose() }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onDelete(template.id); onClose() } }}
          className="list-panel-delete-btn w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 cursor-pointer"
        >
          <Trash2 className="h-4 w-4 flex-shrink-0" />
          Delete
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  )
}

function ShareOutreachDialog({ open, onOpenChange, template, serialize, tabLabel }) {
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (!open || !template) return null
  const payload = serialize(template)

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payload)
      showToast('Template copied to clipboard', 'success')
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: `Outreach: ${template.name || 'Template'}`,
        text: payload,
      })
      showToast('Shared', 'success')
      onOpenChange(false)
    } catch (e) {
      if (e?.name === 'AbortError') return
      await copyPayload()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="map-panel list-panel max-w-md" showCloseButton topLayer focusOverlay hideOverlay>
        <DialogHeader>
          <DialogTitle>Share template</DialogTitle>
          <DialogDescription className="text-left text-sm text-white/70">
            Copy the template data to send in chat or email. Recipients can open Outreach → {tabLabel} and use <span className="text-white/90">Import</span> to paste it. On a phone, use Share to open another app.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={copyPayload} className="create-list-btn border flex-1 min-h-[44px]">
            <Download className="h-4 w-4 mr-2" />
            Copy to clipboard
          </Button>
          {canNativeShare && (
            <Button type="button" variant="outline" onClick={nativeShare} className="create-list-btn border flex-1 min-h-[44px]">
              <Share2 className="h-4 w-4 mr-2" />
              Share…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ImportOutreachDialog({ open, onOpenChange, kind, onImport }) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue('') }, [open])

  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setValue(t)
      else showToast('Clipboard is empty', 'info')
    } catch {
      showToast('Allow clipboard access or paste below', 'info')
    }
  }

  const submit = () => {
    onImport((value || '').trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="map-panel list-panel max-w-md" showCloseButton topLayer focusOverlay hideOverlay>
        <DialogHeader>
          <DialogTitle>Import {kind} template</DialogTitle>
          <DialogDescription className="text-left text-sm text-white/70">
            Paste the JSON a teammate sent you, or use Paste from clipboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" onClick={fromClipboard} className="w-full create-list-btn border">
            Paste from clipboard
          </Button>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full min-h-[140px] p-3 text-sm rounded-lg border border-white/20 bg-white/5 text-white placeholder:text-white/40"
            placeholder="Paste template JSON here…"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button type="button" onClick={submit} className="create-list-btn flex-1 min-h-11">
              Import
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="create-list-btn border flex-1 min-h-11">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EmailTab({ onSelectTemplate: _onSelectTemplate, isOpen }) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const { openId, menuAnchor, openMenu, closeMenu } = useOutreachMenu(isOpen)
  const [shareFor, setShareFor] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    setTemplates(getEmailTemplates())
  }, [])

  const reload = () => setTemplates(getEmailTemplates())

  const handleCreate = () => {
    if (!templateName.trim()) { showToast('Please enter a template name', 'error'); return }
    addEmailTemplate({ name: templateName.trim(), subject: templateSubject, body: templateBody })
    scheduleSync(); reload()
    setTemplateName(''); setTemplateSubject(''); setTemplateBody(''); setShowCreateForm(false)
    showToast('Template created', 'success')
  }

  const handleEdit = (t) => {
    setEditingTemplate(t); setTemplateName(t.name); setTemplateSubject(t.subject); setTemplateBody(t.body); setShowCreateForm(true)
  }

  const handleUpdate = () => {
    if (!templateName.trim()) { showToast('Please enter a template name', 'error'); return }
    updateEmailTemplate(editingTemplate.id, { name: templateName.trim(), subject: templateSubject, body: templateBody })
    scheduleSync(); reload()
    setEditingTemplate(null); setViewingTemplate(null); setTemplateName(''); setTemplateSubject(''); setTemplateBody(''); setShowCreateForm(false)
    showToast('Template updated', 'success')
  }

  const handleDelete = async (id) => {
    if (!await showConfirm('Are you sure you want to delete this template?', 'Delete Template')) return
    deleteEmailTemplate(id); scheduleSync(); reload()
    setViewingTemplate(prev => prev?.id === id ? null : prev)
    showToast('Template deleted', 'success')
  }

  const insertTag = (tag) => {
    const t = `{${tag}}`
    if (focusedField === 'subject') setTemplateSubject(p => p + t)
    else if (focusedField === 'body') setTemplateBody(p => p + t)
  }

  const cancelEdit = () => {
    setEditingTemplate(null); setTemplateName(''); setTemplateSubject(''); setTemplateBody(''); setShowCreateForm(false); setFocusedField(null)
  }

  const hasChanges = editingTemplate
    ? templateName.trim() !== (editingTemplate.name || '').trim() ||
      templateSubject !== (editingTemplate.subject ?? '') ||
      templateBody !== (editingTemplate.body ?? '')
    : false

  const blurHandler = () => {
    setTimeout(() => {
      const el = document.activeElement
      if (el?.tagName !== 'TEXTAREA' && el?.tagName !== 'INPUT') setFocusedField(null)
    }, 200)
  }

  const TagBar = () => (
    <div className="mb-2">
      <p className="text-xs mb-2 opacity-75">Available tags (click to insert):</p>
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_TAGS.map(tag => (
          <Button key={tag} type="button" variant="ghost" size="sm" onMouseDown={(e) => { e.preventDefault(); insertTag(tag) }} className="text-xs border border-white/30">
            {tag}
          </Button>
        ))}
      </div>
    </div>
  )

  const onImportEmail = (raw) => {
    if (!raw || !String(raw).trim()) {
      showToast('Paste the template JSON first', 'error')
      return
    }
    try {
      importEmailTemplateFromShareJson(raw)
      scheduleSync()
      reload()
      setImportOpen(false)
      showToast('Template imported', 'success')
    } catch (e) {
      showToast(e?.message || 'Invalid template', 'error')
    }
  }

  return (
    <>
      {showCreateForm && (
        <div className="space-y-3 create-list-form">
          <Button variant="ghost" size="sm" onClick={cancelEdit} className="mb-0 -mt-0.5 opacity-80 hover:opacity-100" title={editingTemplate ? 'Back to template' : 'Back to list'}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-90">Template Name *</label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Initial Contact" className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-90">Subject</label>
            {focusedField === 'subject' && <TagBar />}
            <Input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} onFocus={() => setFocusedField('subject')} onBlur={blurHandler} placeholder="Email subject line" className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-90">Body</label>
            {focusedField === 'body' && <TagBar />}
            <textarea value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} onFocus={() => setFocusedField('body')} onBlur={blurHandler} placeholder="Email body. Use {Owner Name}, {Address}, etc. to insert dynamic fields." className="w-full min-h-[200px] p-3 border border-white/20 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 scrollbar-hide" rows={8} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={editingTemplate ? handleUpdate : handleCreate} disabled={editingTemplate && !hasChanges} className="flex-1 create-list-btn">{editingTemplate ? 'Update Template' : 'Create Template'}</Button>
            <Button variant="outline" onClick={cancelEdit} className="flex-1 create-list-btn">Cancel</Button>
          </div>
        </div>
      )}

      {!showCreateForm && viewingTemplate && (
        <div className="space-y-2">
          <div className="relative min-h-9">
            <Button variant="ghost" size="sm" onClick={() => setViewingTemplate(null)} className="mb-0 -mt-0.5 opacity-80 hover:opacity-100" title="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-8 w-8 border border-white/20 rounded-md text-white/90 hover:bg-white/10"
              title="Template options"
              onClick={(e) => openMenu(viewingTemplate.id, e)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          <div className="border border-white/20 rounded-lg p-4 pr-3 bg-white/5 space-y-3">
            <h3 className="font-semibold text-lg pr-8">{viewingTemplate.name}</h3>
            <div><p className="text-xs font-medium mb-1 opacity-80">Subject</p><p className="text-sm">{viewingTemplate.subject || '(no subject)'}</p></div>
            <div><p className="text-xs font-medium mb-1 opacity-80">Body</p><p className="text-sm whitespace-pre-wrap">{viewingTemplate.body || '(no body)'}</p></div>
          </div>
        </div>
      )}

      {!showCreateForm && !viewingTemplate && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(true); setEditingTemplate(null); setTemplateName(''); setTemplateSubject(''); setTemplateBody('') }} className="w-full sm:flex-1 create-new-list-btn">
              <Plus className="h-4 w-4 mr-2" />Create New Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="w-full sm:flex-1 create-new-list-btn border" title="Paste a template someone shared with you">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </div>
          {templates.length === 0 ? (
            <p className="text-center py-8 text-sm opacity-80">No email templates yet. Create or import one to get started!</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div
                  key={t.id}
                  className="relative p-4 pr-12 border border-white/20 rounded-lg transition-colors hover:bg-white/10 cursor-pointer"
                  onClick={() => setViewingTemplate(t)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                    <p className="text-xs mb-1 opacity-90"><span className="font-medium">Subject:</span> {t.subject || '(no subject)'}</p>
                    <p className="text-xs line-clamp-2 opacity-80">{t.body || '(no body)'}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 border border-white/20 rounded-md text-white/90 hover:bg-white/10"
                    title="Template options"
                    onClick={(e) => openMenu(t.id, e)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <TemplateMenuDropdown
        openId={openId}
        menuAnchor={menuAnchor}
        templates={templates}
        onClose={closeMenu}
        onEdit={handleEdit}
        onShare={setShareFor}
        onDelete={handleDelete}
      />
      <ShareOutreachDialog
        open={!!shareFor}
        onOpenChange={(v) => { if (!v) setShareFor(null) }}
        template={shareFor}
        serialize={serializeEmailTemplateForShare}
        tabLabel="Email"
      />
      <ImportOutreachDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="email"
        onImport={onImportEmail}
      />
    </>
  )
}

function TextTab({ isOpen }) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const { openId, menuAnchor, openMenu, closeMenu } = useOutreachMenu(isOpen)
  const [shareFor, setShareFor] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    setTemplates(getTextTemplates())
  }, [])

  const reload = () => setTemplates(getTextTemplates())

  const handleCreate = () => {
    if (!templateName.trim()) { showToast('Please enter a template name', 'error'); return }
    addTextTemplate({ name: templateName.trim(), body: templateBody })
    scheduleSync(); reload()
    setTemplateName(''); setTemplateBody(''); setShowCreateForm(false)
    showToast('Template created', 'success')
  }

  const handleEdit = (t) => {
    setEditingTemplate(t); setTemplateName(t.name); setTemplateBody(t.body); setShowCreateForm(true)
  }

  const handleUpdate = () => {
    if (!templateName.trim()) { showToast('Please enter a template name', 'error'); return }
    updateTextTemplate(editingTemplate.id, { name: templateName.trim(), body: templateBody })
    scheduleSync(); reload()
    setEditingTemplate(null); setViewingTemplate(null); setTemplateName(''); setTemplateBody(''); setShowCreateForm(false)
    showToast('Template updated', 'success')
  }

  const handleDelete = async (id) => {
    if (!await showConfirm('Are you sure you want to delete this template?', 'Delete Template')) return
    deleteTextTemplate(id); scheduleSync(); reload()
    setViewingTemplate(prev => prev?.id === id ? null : prev)
    showToast('Template deleted', 'success')
  }

  const insertTag = (tag) => setTemplateBody(p => p + `{${tag}}`)

  const cancelEdit = () => {
    setEditingTemplate(null); setTemplateName(''); setTemplateBody(''); setShowCreateForm(false); setFocusedField(null)
  }

  const hasChanges = editingTemplate
    ? templateName.trim() !== (editingTemplate.name || '').trim() ||
      templateBody !== (editingTemplate.body ?? '')
    : false

  const blurHandler = () => {
    setTimeout(() => {
      const el = document.activeElement
      if (el?.tagName !== 'TEXTAREA' && el?.tagName !== 'INPUT') setFocusedField(null)
    }, 200)
  }

  const onImportText = (raw) => {
    if (!raw || !String(raw).trim()) {
      showToast('Paste the template JSON first', 'error')
      return
    }
    try {
      importTextTemplateFromShareJson(raw)
      scheduleSync()
      reload()
      setImportOpen(false)
      showToast('Template imported', 'success')
    } catch (e) {
      showToast(e?.message || 'Invalid template', 'error')
    }
  }

  return (
    <>
      {showCreateForm && (
        <div className="space-y-4 create-list-form">
          <Button variant="ghost" size="sm" onClick={cancelEdit} className="mb-2 -mt-1 opacity-80 hover:opacity-100" title={editingTemplate ? 'Back to template' : 'Back to list'}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-90">Template Name *</label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Follow-up Text" className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-90">Message</label>
            {focusedField === 'body' && (
              <div className="mb-2">
                <p className="text-xs mb-2 opacity-75">Available tags (click to insert):</p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TAGS.map(tag => (
                    <Button key={tag} type="button" variant="ghost" size="sm" onMouseDown={(e) => { e.preventDefault(); insertTag(tag) }} className="text-xs border border-white/30">{tag}</Button>
                  ))}
                </div>
              </div>
            )}
            <textarea value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} onFocus={() => setFocusedField('body')} onBlur={blurHandler} placeholder="Message body. Use {Owner Name}, {Address}, etc. to insert dynamic fields." className="w-full min-h-[200px] p-3 border border-white/20 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 scrollbar-hide" rows={8} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={editingTemplate ? handleUpdate : handleCreate} disabled={editingTemplate && !hasChanges} className="flex-1 create-list-btn">{editingTemplate ? 'Update Template' : 'Create Template'}</Button>
            <Button variant="outline" onClick={cancelEdit} className="flex-1 create-list-btn">Cancel</Button>
          </div>
        </div>
      )}

      {!showCreateForm && viewingTemplate && (
        <div className="space-y-2">
          <div className="relative min-h-9">
            <Button variant="ghost" size="sm" onClick={() => setViewingTemplate(null)} className="mb-0 -mt-0.5 opacity-80 hover:opacity-100" title="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-8 w-8 border border-white/20 rounded-md text-white/90 hover:bg-white/10"
              title="Template options"
              onClick={(e) => openMenu(viewingTemplate.id, e)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          <div className="border border-white/20 rounded-lg p-4 pr-3 bg-white/5 space-y-3">
            <h3 className="font-semibold text-lg pr-8">{viewingTemplate.name}</h3>
            <div><p className="text-xs font-medium mb-1 opacity-80">Message</p><p className="text-sm whitespace-pre-wrap">{viewingTemplate.body || '(no body)'}</p></div>
          </div>
        </div>
      )}

      {!showCreateForm && !viewingTemplate && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(true); setEditingTemplate(null); setTemplateName(''); setTemplateBody('') }} className="w-full sm:flex-1 create-new-list-btn">
              <Plus className="h-4 w-4 mr-2" />Create New Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="w-full sm:flex-1 create-new-list-btn border" title="Paste a template someone shared with you">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </div>
          {templates.length === 0 ? (
            <p className="text-center py-8 text-sm opacity-80">No text templates yet. Create or import one to get started!</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div
                  key={t.id}
                  className="relative p-4 pr-12 border border-white/20 rounded-lg transition-colors hover:bg-white/10 cursor-pointer"
                  onClick={() => setViewingTemplate(t)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                    <p className="text-xs line-clamp-2 opacity-80">{t.body || '(no body)'}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 border border-white/20 rounded-md text-white/90 hover:bg-white/10"
                    title="Template options"
                    onClick={(e) => openMenu(t.id, e)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <TemplateMenuDropdown
        openId={openId}
        menuAnchor={menuAnchor}
        templates={templates}
        onClose={closeMenu}
        onEdit={handleEdit}
        onShare={setShareFor}
        onDelete={handleDelete}
      />
      <ShareOutreachDialog
        open={!!shareFor}
        onOpenChange={(v) => { if (!v) setShareFor(null) }}
        template={shareFor}
        serialize={serializeTextTemplateForShare}
        tabLabel="Text"
      />
      <ImportOutreachDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="text"
        onImport={onImportText}
      />
    </>
  )
}

const TABS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'text', label: 'Text', icon: MessageSquare },
]

export function OutreachPanel({ isOpen, onClose, onSelectTemplate, isBulkMode = false, initialTab = 'email' }) {
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="map-panel list-panel outreach-panel fullscreen-panel" showCloseButton={false} hideOverlay topLayer>
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <Send className="h-5 w-5 shrink-0" />
              <span className="truncate">Outreach</span>
            </DialogTitle>
            <div className="map-panel-header-actions">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">Manage email and text message templates for outreach</DialogDescription>
          <div className="outreach-tabs inline-flex rounded-lg p-0.5 gap-0.5 mt-3 w-full">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "outreach-tab flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
                    isActive && "outreach-tab-active"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </DialogHeader>

        <div className="px-6 pt-3 pb-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className={activeTab === 'email' ? '' : 'hidden'}>
            <EmailTab onSelectTemplate={onSelectTemplate} isOpen={isOpen} />
          </div>
          <div className={activeTab === 'text' ? '' : 'hidden'}>
            <TextTab isOpen={isOpen} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
