import { useState, useEffect } from 'react'
import { X, Mail, Send, Edit2, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { replaceTemplateTags, updateEmailTemplate, AVAILABLE_TAGS } from '../utils/emailTemplates'
import { getSkipTracedParcel } from '../utils/skipTrace'

export function BulkEmailPreview({
  isOpen,
  onClose,
  template,
  list,
  listId,
  onConfirm,
  onCancel
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [previewParcel, setPreviewParcel] = useState(null)
  const [previewEmail, setPreviewEmail] = useState('')
  const [isSending, setIsSending] = useState(false)

  // Load preview parcel (first parcel with email)
  useEffect(() => {
    if (isOpen && template && list && list.parcels && list.parcels.length > 0) {
      // Find first parcel with email
      for (const parcel of list.parcels) {
        const parcelId = parcel.id || parcel.properties?.PROP_ID || parcel
        const skipTracedInfo = getSkipTracedParcel(parcelId)
        
        if (skipTracedInfo && skipTracedInfo.email) {
          const parcelData = {
            id: parcelId,
            properties: parcel.properties || parcel,
            address: parcel.address || parcel.properties?.SITUS_ADDR || parcel.properties?.SITE_ADDR || '',
            ownerName: parcel.properties?.OWNER_NAME || ''
          }
          setPreviewParcel(parcelData)
          setPreviewEmail(skipTracedInfo.email)
          break
        }
      }
    }
  }, [isOpen, template, list])

  // Update subject/body when template changes
  useEffect(() => {
    if (template) {
      setSubject(template.subject || '')
      setBody(template.body || '')
    }
  }, [template])

  // Update preview when subject/body changes
  useEffect(() => {
    if (previewParcel && subject && body) {
      // Preview is already shown via replaceTemplateTags in render
    }
  }, [subject, body, previewParcel])

  const insertTag = (tag) => {
    const tagText = `{${tag}}`
    if (focusedField === 'subject') {
      setSubject(prev => prev + tagText)
    } else if (focusedField === 'body') {
      setBody(prev => prev + tagText)
    }
  }

  const hasTemplateChanges = template
    ? subject !== (template.subject ?? '') || body !== (template.body ?? '')
    : false

  const handleSaveTemplate = () => {
    if (template) {
      updateEmailTemplate(template.id, {
        subject,
        body
      })
      showToast('Template updated', 'success')
      setIsEditing(false)
    }
  }

  const handleConfirm = async () => {
    if (!template) {
      showToast('No template selected', 'error')
      return
    }

    // Update template if edited
    if (isEditing && template.id) {
      updateEmailTemplate(template.id, {
        subject,
        body
      })
    }

    setIsSending(true)
    
    if (onConfirm) {
      await onConfirm({
        template: {
          ...template,
          subject: subject || template.subject || '',
          body: body || template.body || ''
        },
        listId
      })
    }
    
    setIsSending(false)
  }

  const previewSubject = previewParcel ? replaceTemplateTags(subject, previewParcel) : subject
  const previewBody = previewParcel ? replaceTemplateTags(body, previewParcel) : body

  // Count parcels with emails
  const parcelsWithEmails = list?.parcels?.filter(parcel => {
    const parcelId = parcel.id || parcel.properties?.PROP_ID || parcel
    const skipTracedInfo = getSkipTracedParcel(parcelId)
    return skipTracedInfo && skipTracedInfo.email
  }).length || 0

  if (!isOpen || !template || !list) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isSending) {
        onClose()
      }
    }}>
      <DialogContent className="map-panel email-panel max-w-3xl max-h-[90vh] p-0" showCloseButton={false} topLayer>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <Mail className="h-5 w-5 shrink-0" />
              <span className="truncate">Email Preview & Confirmation</span>
            </DialogTitle>
            <div className="map-panel-header-actions">
              {!isSending && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <DialogDescription>
            Preview and confirm bulk email sending
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(90vh-200px)] space-y-4">
          {/* List Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{list.name}</h3>
                <p className="text-sm text-gray-600">
                  {parcelsWithEmails} of {list.parcels.length} properties have email addresses
                </p>
              </div>
            </div>
          </div>

          {/* Edit Template Button */}
          {!isEditing && !isSending && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Template
              </Button>
            </div>
          )}

          {/* Editing Mode */}
          {isEditing && !isSending && (
            <div className="space-y-4 border p-4 rounded-lg bg-gray-50">
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
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => setFocusedField('subject')}
                  onBlur={() => {
                    setTimeout(() => {
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
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onFocus={() => setFocusedField('body')}
                  onBlur={() => {
                    setTimeout(() => {
                      const activeElement = document.activeElement
                      if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
                        setFocusedField(null)
                      }
                    }, 200)
                  }}
                  placeholder="Email body"
                  className="w-full min-h-[150px] p-3 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={6}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={handleSaveTemplate}
                  disabled={!hasTemplateChanges}
                  className="flex-1"
                >
                  Save Changes
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false)
                    setSubject(template.subject || '')
                    setBody(template.body || '')
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Email Preview */}
          {!isEditing && (
            <div className="border rounded-lg p-4 bg-white">
              <div className="mb-4">
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Email Preview (using first parcel):</h3>
                <div className="text-xs text-gray-500 mb-2">
                  To: {previewEmail || '(no email)'}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Subject:</div>
                  <div className="p-2 bg-gray-50 rounded border text-sm">
                    {previewSubject || '(no subject)'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Body:</div>
                  <div className="p-3 bg-gray-50 rounded border text-sm whitespace-pre-wrap min-h-[100px]">
                    {previewBody || '(no body)'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sending Status */}
          {isSending && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Sending emails...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isSending && (
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onCancel || onClose}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={handleConfirm}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send to {parcelsWithEmails} Properties
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
