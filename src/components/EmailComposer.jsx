import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Mail, Send, Paperclip, X, Loader2 } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { replaceTemplateTags } from '../utils/emailTemplates'
import { getSettings } from '../utils/settings'
import { sendOutreachEmail } from '../utils/outreachEmail'
import {
  readFilesAsAttachments,
  validateAttachmentTotalSize,
  normalizeEmailAddress,
} from '../utils/outreachAttachments'
import { formatStorageBytes, MAX_SINGLE_UPLOAD_BYTES } from '../utils/uploadLimits'
import { OutreachCcField } from './outreach/OutreachCcField'

export function EmailComposer({
  isOpen,
  onClose,
  template,
  parcelData,
  recipientEmail,
  recipientName,
  leadId = null,
  onOutreach,
  getToken,
  currentUser,
  teamMembers = [],
  emailTestMode = false,
  testEmail = '',
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendMeCopy, setSendMeCopy] = useState(false)
  const [ccMemberUids, setCcMemberUids] = useState([])
  const [externalCcEmails, setExternalCcEmails] = useState([])
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)

  const actualRecipientEmail = (emailTestMode && testEmail) ? testEmail : recipientEmail

  useEffect(() => {
    if (!isOpen) return
    setSendMeCopy(false)
    setCcMemberUids([])
    setExternalCcEmails([])
    setAttachments([])
    if (template && parcelData) {
      setSubject(replaceTemplateTags(template.subject, parcelData))
      setBody(replaceTemplateTags(template.body, parcelData))
    } else if (template) {
      setSubject(template.subject || '')
      setBody(template.body || '')
    } else {
      setSubject('')
      setBody('')
    }
  }, [isOpen, template, parcelData])

  const attachmentBytes = useMemo(
    () => attachments.reduce((sum, f) => sum + (Number(f.size) || 0), 0),
    [attachments],
  )

  const ccEmails = useMemo(() => {
    const selected = new Set(ccMemberUids)
    const fromMembers = (teamMembers || [])
      .filter((m) => selected.has(m.uid))
      .map((m) => normalizeEmailAddress(m.email))
    const combined = [...fromMembers, ...externalCcEmails.map(normalizeEmailAddress)]
    const seen = new Set()
    const to = normalizeEmailAddress(actualRecipientEmail)
    return combined.filter((email) => {
      if (!email || email === to || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [ccMemberUids, externalCcEmails, teamMembers, actualRecipientEmail])

  const handleToggleCcMember = useCallback((uid) => {
    setCcMemberUids((prev) => (
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    ))
  }, [])

  const handleAddExternalCc = useCallback((email) => {
    setExternalCcEmails((prev) => (prev.includes(email) ? prev : [...prev, email]))
  }, [])

  const handleRemoveExternalCc = useCallback((email) => {
    setExternalCcEmails((prev) => prev.filter((e) => e !== email))
  }, [])

  const handleAttachmentPick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const err = validateAttachmentTotalSize(attachments, files)
    if (err) {
      showToast(err, 'error')
      return
    }
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        name: file.name,
        size: file.size,
      })),
    ])
  }

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSend = async () => {
    if (!recipientEmail) {
      showToast('No recipient email address', 'error')
      return
    }

    if (!subject.trim() && !body.trim()) {
      showToast('Email subject and body cannot both be empty', 'error')
      return
    }

    const ccSummary = ccEmails.length ? `\nCC: ${ccEmails.join(', ')}` : ''
    const confirmed = await showConfirm(
      `Send email to ${actualRecipientEmail}${actualRecipientEmail !== recipientEmail ? ` (testing - original: ${recipientEmail})` : ''}?${ccSummary}`,
      'Confirm Send',
    )
    if (!confirmed) return

    setIsSending(true)
    try {
      const s = getSettings()
      const finalBody = s.emailSignatureEnabled && s.emailSignature
        ? `${body}\n\n${s.emailSignature}`
        : body

      const attachmentPayload = attachments.length
        ? await readFilesAsAttachments(attachments.map((a) => a.file))
        : []

      await sendOutreachEmail(getToken, {
        recipientEmail: actualRecipientEmail,
        cc: ccEmails,
        subject,
        message: finalBody,
        sendMeCopy,
        attachments: attachmentPayload,
        leadId: leadId || undefined,
      })

      if (leadId && onOutreach) onOutreach('email')
      showToast(sendMeCopy ? 'Email sent — copy sent to you' : 'Email sent', 'success')
      onClose()
    } catch (error) {
      console.error('Error sending email:', error)
      showToast(error.message || 'Failed to send email', 'error')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen || !parcelData) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent className="map-panel email-panel max-w-2xl max-h-[90vh] p-0" showCloseButton={false} nestedOverlay topLayer>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <PanelHeader onBack={onClose} title="Compose Email" icon={Mail} />
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

          <OutreachCcField
            teamMembers={teamMembers}
            selectedMemberUids={ccMemberUids}
            onToggleMember={handleToggleCcMember}
            externalEmails={externalCcEmails}
            onAddExternalEmail={handleAddExternalCc}
            onRemoveExternalEmail={handleRemoveExternalCc}
            excludeEmail={actualRecipientEmail}
            disabled={isSending}
          />

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
              className="w-full min-h-[240px] p-3 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={10}
              placeholder="Email body"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Attachments
              </label>
              <span className="text-xs text-gray-500">
                {formatStorageBytes(attachmentBytes)} / {formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleAttachmentPick}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || attachmentBytes >= MAX_SINGLE_UPLOAD_BYTES}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              Add files
            </Button>
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachments.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{formatStorageBytes(item.size)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(item.id)}
                      disabled={isSending}
                      className="shrink-0 rounded p-1 hover:bg-gray-200 disabled:opacity-50"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendMeCopy}
              onChange={(e) => setSendMeCopy(e.target.checked)}
              disabled={isSending || !currentUser?.email}
              className="h-4 w-4 accent-blue-600 cursor-pointer disabled:opacity-50"
            />
            Send me a copy
          </label>
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
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
