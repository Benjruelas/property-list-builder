import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Mail, MessageSquare, Send, ArrowLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { getEmailTemplates, addEmailTemplate, updateEmailTemplate, deleteEmailTemplate, AVAILABLE_TAGS } from '../utils/emailTemplates'
import { getTextTemplates, addTextTemplate, updateTextTemplate, deleteTextTemplate } from '../utils/textTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

function EmailTab({ onSelectTemplate }) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)

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

  if (showCreateForm) {
    return (
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
    )
  }

  if (viewingTemplate) {
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => setViewingTemplate(null)} className="mb-0 -mt-0.5 opacity-80 hover:opacity-100" title="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="border border-white/20 rounded-lg p-4 bg-white/5 space-y-3">
          <h3 className="font-semibold text-lg">{viewingTemplate.name}</h3>
          <div><p className="text-xs font-medium mb-1 opacity-80">Subject</p><p className="text-sm">{viewingTemplate.subject || '(no subject)'}</p></div>
          <div><p className="text-xs font-medium mb-1 opacity-80">Body</p><p className="text-sm whitespace-pre-wrap">{viewingTemplate.body || '(no body)'}</p></div>
        </div>
        <div className="flex justify-between gap-4">
          <Button variant="outline" onClick={() => handleEdit(viewingTemplate)} className="create-list-btn flex-1" title="Edit"><Edit2 className="h-4 w-4" /></Button>
          <Button variant="ghost" className="list-panel-delete-btn flex-1 text-red-400 hover:bg-red-600/20 hover:text-red-300 [&_svg]:text-current" onClick={() => handleDelete(viewingTemplate.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(true); setEditingTemplate(null); setTemplateName(''); setTemplateSubject(''); setTemplateBody('') }} className="w-full create-new-list-btn">
          <Plus className="h-4 w-4 mr-2" />Create New Template
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="text-center py-8 text-sm opacity-80">No email templates yet. Create one to get started!</p>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="p-4 border border-white/20 rounded-lg transition-colors hover:bg-white/10 cursor-pointer" onClick={() => setViewingTemplate(t)}>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                <p className="text-xs mb-1 opacity-90"><strong>Subject:</strong> {t.subject || '(no subject)'}</p>
                <p className="text-xs line-clamp-2 opacity-80">{t.body || '(no body)'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function TextTab() {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)

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

  if (showCreateForm) {
    return (
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
    )
  }

  if (viewingTemplate) {
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => setViewingTemplate(null)} className="mb-0 -mt-0.5 opacity-80 hover:opacity-100" title="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="border border-white/20 rounded-lg p-4 bg-white/5 space-y-3">
          <h3 className="font-semibold text-lg">{viewingTemplate.name}</h3>
          <div><p className="text-xs font-medium mb-1 opacity-80">Message</p><p className="text-sm whitespace-pre-wrap">{viewingTemplate.body || '(no body)'}</p></div>
        </div>
        <div className="flex justify-between gap-4">
          <Button variant="outline" onClick={() => handleEdit(viewingTemplate)} className="create-list-btn flex-1" title="Edit"><Edit2 className="h-4 w-4" /></Button>
          <Button variant="ghost" className="list-panel-delete-btn flex-1 text-red-400 hover:bg-red-600/20 hover:text-red-300 [&_svg]:text-current" onClick={() => handleDelete(viewingTemplate.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(true); setEditingTemplate(null); setTemplateName(''); setTemplateBody('') }} className="w-full create-new-list-btn">
          <Plus className="h-4 w-4 mr-2" />Create New Template
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="text-center py-8 text-sm opacity-80">No text templates yet. Create one to get started!</p>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="p-4 border border-white/20 rounded-lg transition-colors hover:bg-white/10 cursor-pointer" onClick={() => setViewingTemplate(t)}>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                <p className="text-xs line-clamp-2 opacity-80">{t.body || '(no body)'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
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
      <DialogContent className="map-panel list-panel outreach-panel fullscreen-panel" showCloseButton={false} hideOverlay>
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
            <EmailTab onSelectTemplate={onSelectTemplate} />
          </div>
          <div className={activeTab === 'text' ? '' : 'hidden'}>
            <TextTab />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
