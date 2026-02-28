import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Mail } from 'lucide-react'
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
    showToast('Template deleted successfully', 'success')
  }

  const handleSelectTemplate = async (template) => {
    console.log('📧 EmailTemplatesPanel: handleSelectTemplate called with template:', template?.name)
    if (onSelectTemplate) {
      console.log('📧 EmailTemplatesPanel: Calling onSelectTemplate')
      // Call the handler - it will manage closing the panel
      await onSelectTemplate(template)
      console.log('📧 EmailTemplatesPanel: onSelectTemplate completed')
    } else {
      console.warn('📧 EmailTemplatesPanel: onSelectTemplate is not provided')
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
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
        cancelEdit()
      }
    }}>
      <DialogContent className="map-panel email-panel max-w-2xl max-h-[90vh] p-0" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
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

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(90vh-200px)]">
          {!showCreateForm ? (
            <>
              <div className="mb-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(true)
                    setEditingTemplate(null)
                    setTemplateName('')
                    setTemplateSubject('')
                    setTemplateBody('')
                  }}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Template
                </Button>
              </div>

              {templates.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No templates yet. Create one to get started!
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className={cn(
                        "p-4 border rounded-lg transition-colors",
                        onSelectTemplate ? "hover:bg-gray-50 cursor-pointer" : "hover:bg-gray-50"
                      )}
                      onClick={onSelectTemplate ? () => handleSelectTemplate(template) : undefined}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                          <p className="text-xs text-gray-600 mb-1">
                            <strong>Subject:</strong> {template.subject || '(no subject)'}
                          </p>
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {template.body || '(no body)'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                          {onSelectTemplate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSelectTemplate(template)}
                              title="Use this template"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditTemplate(template)}
                            title="Edit template"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-400 [&_svg]:text-current"
                            onClick={() => handleDeleteTemplate(template.id)}
                            title="Delete template"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                {focusedField === 'subject' && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-2">Available tags (click to insert):</p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map(tag => (
                        <Button
                          key={tag}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onMouseDown={(e) => {
                            // Prevent input from losing focus when clicking tag
                            e.preventDefault()
                            insertTag(tag)
                          }}
                          className="text-xs"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Body
                </label>
                {focusedField === 'body' && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-2">Available tags (click to insert):</p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map(tag => (
                        <Button
                          key={tag}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onMouseDown={(e) => {
                            // Prevent textarea from losing focus when clicking tag
                            e.preventDefault()
                            insertTag(tag)
                          }}
                          className="text-xs"
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
                  className="w-full min-h-[200px] p-3 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={8}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  className="flex-1"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={cancelEdit}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
