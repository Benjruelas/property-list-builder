import { useState, useEffect } from 'react'
import { X, Mail, Send, CheckCircle2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { replaceTemplateTags } from '../utils/emailTemplates'

// Test email for development - all emails will be sent to this address
const TEST_EMAIL = 'benjruelas@gmail.com'

export function EmailComposer({
  isOpen,
  onClose,
  template,
  parcelData,
  recipientEmail,
  recipientName,
  onSend
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  // Use test email for all emails during testing
  const actualRecipientEmail = TEST_EMAIL

  useEffect(() => {
    if (isOpen && template && parcelData) {
      // Replace template tags with actual values
      const filledSubject = replaceTemplateTags(template.subject, parcelData)
      const filledBody = replaceTemplateTags(template.body, parcelData)
      setSubject(filledSubject)
      setBody(filledBody)
    }
  }, [isOpen, template, parcelData])

  const handleSend = async () => {
    if (!recipientEmail) {
      showToast('No recipient email address', 'error')
      return
    }

    if (!subject.trim() && !body.trim()) {
      showToast('Email subject and body cannot both be empty', 'error')
      return
    }

    const confirmed = await showConfirm(
      `Send email to ${actualRecipientEmail}${actualRecipientEmail !== recipientEmail ? ` (testing - original: ${recipientEmail})` : ''}?`,
      'Confirm Send'
    )
    if (!confirmed) return

    setIsSending(true)
    try {
      // Create mailto link (browser will handle sending)
      // Use test email for testing
      const mailtoLink = `mailto:${actualRecipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.location.href = mailtoLink

      // Call onSend callback if provided
      if (onSend) {
        onSend({
          to: recipientEmail,
          subject,
          body,
          parcelId: parcelData?.id
        })
      }

      showToast('Email opened in your email client', 'success')
      onClose()
    } catch (error) {
      console.error('Error sending email:', error)
      showToast('Failed to open email client', 'error')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen || !template || !parcelData) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent className="map-panel email-panel max-w-2xl max-h-[90vh] p-0" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Compose Email
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
            Review and send email to property owner
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(90vh-200px)] space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <div className="p-2 bg-gray-50 rounded border text-sm">
              {actualRecipientEmail}
              {actualRecipientEmail !== recipientEmail && (
                <span className="text-orange-600 ml-2 text-xs">(Testing - Original: {recipientEmail})</span>
              )}
              {recipientName && actualRecipientEmail === recipientEmail && (
                <span className="text-gray-500 ml-2">({recipientName})</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Email subject"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[300px] p-3 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={12}
              placeholder="Email body"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <span>Review the email above. Clicking "Send" will open your email client.</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
