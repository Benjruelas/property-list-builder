import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Mail, ArrowLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { getEmailTemplates, addEmailTemplate, updateEmailTemplate, deleteEmailTemplate, AVAILABLE_TAGS } from '../utils/emailTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

export function EmailTemplatesPanel({ isOpen, onClose, onSelectTemplate, isBulkMode = false }) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null) // 'subject' or 'body' or null

  // Load templates when panel opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen])

  const loadTemplates = () => {
    const loaded = getEmailTemplates()
    setTemplates(loaded)
  }

  const handleCreateTemplate = () => {
    if (!templateName.trim()) {
      showToast('Please enter a template name', 'error')
      return
    }

    addEmailTemplate({
      name: templateName.trim(),
      subject: templateSubject,
      body: templateBody
    })
    scheduleSync()
    loadTemplates()
    setTemplateName('')
    setTemplateSubject('')
    setTemplateBody('')
    setShowCreateForm(false)
    showToast('Template created successfully', 'success')
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setTemplateName(template.name)
    setTemplateSubject(template.subject)
    setTemplateBody(template.body)
    setShowCreateForm(true)
  }

  const handleUpdateTemplate = () => {
    if (!templateName.trim()) {
      showToast('Please enter a template name', 'error')
      return
    }

    updateEmailTemplate(editingTemplate.id, {
      name: templateName.trim(),
      subject: templateSubject,
      body: templateBody
    })
    scheduleSync()
    loadTemplates()
    setEditingTemplate(null)
    setViewingTemplate(null)
    setTemplateName('')
    setTemplateSubject('')
    setTemplateBody('')
    setShowCreateForm(false)
    showToast('Template updated successfully', 'success')
  }

  const handleDeleteTemplate = async (templateId) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this template?',
      'Delete Template'
    )
    if (!confirmed) return

    deleteEmailTemplate(templateId)
    scheduleSync()
    loadTemplates()
    setViewingTemplate((prev) => (prev?.id === templateId ? null : prev))
    showToast('Template deleted successfully', 'success')
  }

  const handleSelectTemplate = async (template) => {
    if (onSelectTemplate) {
      await onSelectTemplate(template)
    }
  }

  const insertTag = (tag) => {
    const tagText = `{${tag}}`
    if (focusedField === 'subject') {
      setTemplateSubject(prev => prev + tagText)
    } else if (focusedField === 'body') {
      setTemplateBody(prev => prev + tagText)
    }
  }

  const cancelEdit = () => {
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateSubject('')
    setTemplateBody('')
    setShowCreateForm(false)
    setFocusedField(null)
    // viewingTemplate stays so we return to view mode if we came from there
  }

  const hasChanges = editingTemplate
    ? templateName.trim() !== (editingTemplate.name || '').trim() ||
      templateSubject !== (editingTemplate.subject ?? '') ||
      templateBody !== (editingTemplate.body ?? '')
    : false

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
        cancelEdit()
        setViewingTemplate(null)
      }
    }}>
      <DialogContent className="map-panel list-panel email-panel fullscreen-panel" showCloseButton={false} hideOverlay>
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Templates
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            Manage email templates for sending to property owners
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-2 pb-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {showCreateForm ? (
            <div className="space-y-3 create-list-form">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                className="mb-0 -mt-0.5 opacity-80 hover:opacity-100"
                title={editingTemplate ? 'Back to template' : 'Back to list'}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-90">
                  Template Name *
                </label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Initial Contact"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 opacity-90">
                  Subject
                </label>
                {focusedField === 'subject' && (
                  <div className="mb-2">
                    <p className="text-xs mb-2 opacity-75">Available tags (click to insert):</p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map(tag => (
                        <Button
                          key={tag}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertTag(tag)
                          }}
                          className="text-xs border border-white/30"
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Input
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  onFocus={() => setFocusedField('subject')}
                  onBlur={() => {
                    // Only hide tags if clicking outside both fields and tag buttons
                    setTimeout(() => {
                      // Check if focus moved to body field
                      const activeElement = document.activeElement
                      if (activeElement?.tagName !== 'TEXTAREA' && activeElement?.tagName !== 'INPUT') {
                        setFocusedField(null)
                      }
                    }, 200)
                  }}
                  placeholder="Email subject line"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 opacity-90">
                  Body
                </label>
                {focusedField === 'body' && (
                  <div className="mb-2">
                    <p className="text-xs mb-2 opacity-75">Available tags (click to insert):</p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map(tag => (
                        <Button
                          key={tag}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertTag(tag)
                          }}
                          className="text-xs border border-white/30"
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  onFocus={() => setFocusedField('body')}
                  onBlur={() => {
                    // Only hide tags if clicking outside both fields and tag buttons
                    setTimeout(() => {
                      // Check if focus moved to subject field
                      const activeElement = document.activeElement
                      if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
                        setFocusedField(null)
                      }
                    }, 200)
                  }}
                  placeholder="Email body. Use {Owner Name}, {Address}, etc. to insert dynamic fields."
                  className="w-full min-h-[200px] p-3 border border-white/20 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 scrollbar-hide"
                  rows={8}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  disabled={editingTemplate && !hasChanges}
                  className="flex-1 create-list-btn"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </Button>
                <Button
                  variant="outline"
                  onClick={cancelEdit}
                  className="flex-1 create-list-btn"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : viewingTemplate ? (
            /* View mode: read-only display with Edit button */
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingTemplate(null)}
                className="mb-0 -mt-0.5 opacity-80 hover:opacity-100"
                title="Back to list"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="border border-white/20 rounded-lg p-4 bg-white/5 space-y-3">
                <h3 className="font-semibold text-lg">{viewingTemplate.name}</h3>
                <div>
                  <p className="text-xs font-medium mb-1 opacity-80">Subject</p>
                  <p className="text-sm">{viewingTemplate.subject || '(no subject)'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1 opacity-80">Body</p>
                  <p className="text-sm whitespace-pre-wrap">{viewingTemplate.body || '(no body)'}</p>
                </div>
              </div>
              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={() => handleEditTemplate(viewingTemplate)}
                  className="create-list-btn flex-1"
                  title="Edit"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="list-panel-delete-btn flex-1 text-red-400 hover:bg-red-600/20 hover:text-red-300 [&_svg]:text-current"
                  onClick={() => handleDeleteTemplate(viewingTemplate.id)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* List view */
            <>
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreateForm(true)
                    setEditingTemplate(null)
                    setTemplateName('')
                    setTemplateSubject('')
                    setTemplateBody('')
                  }}
                  className="w-full create-new-list-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Template
                </Button>
              </div>
              {templates.length === 0 ? (
                <p className="text-center py-8 text-sm opacity-80">
                  No templates yet. Create one to get started!
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className={cn(
                        "p-4 border border-white/20 rounded-lg transition-colors hover:bg-white/10 cursor-pointer"
                      )}
                      onClick={() => setViewingTemplate(template)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                          <p className="text-xs mb-1 opacity-90">
                            <strong>Subject:</strong> {template.subject || '(no subject)'}
                          </p>
                          <p className="text-xs line-clamp-2 opacity-80">
                            {template.body || '(no body)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
