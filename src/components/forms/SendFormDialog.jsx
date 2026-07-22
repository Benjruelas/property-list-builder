import { useEffect, useMemo, useState } from 'react'
import { Loader2, Link2, CheckCircle2, Mail, MessageSquare, User } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { showToast } from '../ui/toast'
import { useAuth } from '../../contexts/AuthContext'
import { createFormInvite, sendForm } from '../../utils/forms'
import { buildSendPayload } from '../../lib/forms/emailPayload'
import {
  getLeadEmails,
  getLeadPhones,
  getLeadEmailDetails,
  getLeadPhoneDetails,
} from '@/utils/leadContact'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { logLeadFormSent } from '@/utils/leadActivity'
import { invalidateCachedLeadForms } from '@/utils/leadForms'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { LeadContactActionTile } from '../leads/LeadContactActionTile'
import { LeadContactPickerDialog } from '../leads/LeadContactPickerDialog'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function SendFormActionTile({ icon: Icon, label, onClick, disabled, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="lead-detail-action-tile disabled:opacity-40"
    >
      {loading ? (
        <Loader2 className="lead-detail-action-icon shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icon className="lead-detail-action-icon shrink-0 opacity-80" aria-hidden />
      )}
      <span className="lead-detail-action-label">{label}</span>
    </button>
  )
}

export function SendFormDialog({
  open,
  template,
  prefillValues,
  onClose,
  lead = null,
  pdfBase64 = null,
  values = null,
  onSent,
  mode = 'invite',
}) {
  const { getToken } = useAuth()
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [sentLabel, setSentLabel] = useState(null)
  const [copyPickerOpen, setCopyPickerOpen] = useState(false)
  const [activeAction, setActiveAction] = useState(null)

  const leadEmails = useMemo(() => (lead ? getLeadEmails(lead) : []), [lead])
  const leadPhones = useMemo(() => (lead ? getLeadPhones(lead) : []), [lead])
  const emailDetails = useMemo(() => (lead ? getLeadEmailDetails(lead) : []), [lead])
  const phoneDetails = useMemo(() => (lead ? getLeadPhoneDetails(lead) : []), [lead])

  useEffect(() => {
    if (!open) return
    setRecipientEmail('')
    setMessage('')
    setSubject(`Please complete: ${template?.name || 'Form'}`)
    setSentLabel(null)
    setCopyPickerOpen(false)
    setActiveAction(null)
  }, [open, template?.name])

  const prefillCount = useMemo(
    () => Object.keys(prefillValues || {}).length,
    [prefillValues],
  )

  const resetForm = () => {
    setRecipientEmail('')
    setMessage('')
    setSentLabel(null)
    setActiveAction(null)
  }

  const handleClose = () => {
    if (sending) return
    resetForm()
    onClose?.()
  }

  const leadMeta = lead?.id ? {
    leadId: lead.id,
    leadName: displayLeadName(lead),
  } : {}

  const logSent = async (summary, meta = {}) => {
    if (!lead?.id) return
    try {
      await logLeadFormSent(getToken, lead.id, summary, {
        templateId: template?.id,
        templateName: template?.name,
        ...meta,
      })
      invalidateCachedLeadForms(lead.id)
      onSent?.()
    } catch {
      /* non-blocking */
    }
  }

  const ensureInviteLink = async ({ email, phone, skipEmail = false } = {}) => {
    const res = await createFormInvite(getToken, {
      templateId: template.id,
      recipientEmail: email || undefined,
      recipientPhone: phone || undefined,
      prefillValues: prefillCount > 0 ? prefillValues : undefined,
      skipEmail,
      ...leadMeta,
    })
    return res.formLink
  }

  const handleSendEmail = async (email) => {
    if (sending) return
    const trimmed = String(email || '').trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('This lead has no valid email', 'error')
      return
    }
    if (!template?.id) return
    setSending(true)
    setActiveAction('email')
    try {
      if (mode === 'completed' && pdfBase64) {
        const payload = buildSendPayload({
          template,
          values: values || {},
          recipient: trimmed,
          subject: subject.trim() || `Completed form: ${template.name || 'Form'}`,
          message: message.trim(),
          flattenedPdfBase64: pdfBase64,
        })
        await sendForm(getToken, {
          ...payload,
          ...leadMeta,
          recipientPhone: leadPhones[0]?.replace(/\D/g, '').slice(-10) || undefined,
        })
        setSentLabel(trimmed)
        showToast(`Form sent to ${trimmed}`, 'success')
        await logSent(`Sent completed form: ${template.name || 'Form'}`, { channel: 'email', recipientEmail: trimmed })
        return
      }

      await createFormInvite(getToken, {
        templateId: template.id,
        recipientEmail: trimmed,
        recipientPhone: leadPhones[0]?.replace(/\D/g, '').slice(-10) || undefined,
        subject: subject.trim() || undefined,
        prefillValues: prefillCount > 0 ? prefillValues : undefined,
        ...leadMeta,
      })
      setSentLabel(trimmed)
      showToast(`Request sent to ${trimmed}`, 'success')
      await logSent(`Sent form link: ${template.name || 'Form'}`, { channel: 'email', recipientEmail: trimmed })
    } catch (e) {
      showToast(e.message || 'Failed to send form', 'error')
    } finally {
      setSending(false)
      setActiveAction(null)
    }
  }

  const handleSendText = async (phone) => {
    if (sending) return
    const tel = String(phone || '').replace(/[^\d+]/g, '')
    if (tel.length < 10) {
      showToast('This lead has no valid phone number', 'error')
      return
    }
    if (!template?.id) return
    setSending(true)
    setActiveAction('text')
    try {
      const link = await ensureInviteLink({
        phone: tel.slice(-10),
        email: leadEmails[0] || undefined,
        skipEmail: true,
      })
      const msg = `Please complete this form: ${link}`
      window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`
      showToast('Opening SMS…', 'success')
      await logSent(`Sent form link via text: ${template.name || 'Form'}`, { channel: 'text', recipientPhone: tel.slice(-10) })
      setSentLabel(formatPhoneDisplay(tel.slice(-10)))
    } catch (e) {
      showToast(e.message || 'Failed to generate link', 'error')
    } finally {
      setSending(false)
      setActiveAction(null)
    }
  }

  const handleCopyLink = async (email) => {
    if (sending) return
    const trimmed = String(email || '').trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('This lead has no valid email', 'error')
      return
    }
    setSending(true)
    setActiveAction('copy')
    try {
      const link = await ensureInviteLink({ email: trimmed })
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch (e) {
      showToast(e.message || 'Could not copy link', 'error')
    } finally {
      setSending(false)
      setActiveAction(null)
    }
  }

  const handleCopyLinkClick = () => {
    if (leadEmails.length === 0) {
      showToast('This lead has no email on file', 'error')
      return
    }
    if (leadEmails.length === 1) {
      void handleCopyLink(leadEmails[0])
      return
    }
    setCopyPickerOpen(true)
  }

  const copyPickerItems = useMemo(
    () => leadEmails.map((email, index) => ({
      value: email,
      title: email,
      subtitle: leadEmails.length > 1 ? `Email ${index + 1}` : null,
    })),
    [leadEmails],
  )

  const handleGenericSend = async () => {
    const trimmed = recipientEmail.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    await handleSendEmail(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog forms-send-dialog w-[min(92vw,22rem)] max-w-sm max-h-[min(88vh,640px)] overflow-y-auto rounded-xl p-6 gap-4"
        focusOverlay
        topLayer
        confirmLayer
      >
        {sentLabel ? (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>Form sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90 leading-relaxed">
                  to: {sentLabel}
                </DialogDescription>
              </div>
            </DialogHeader>
            <Button type="button" className="w-full share-dialog-btn forms-send-confirm" onClick={handleClose}>
              Done
            </Button>
          </>
        ) : lead ? (
          <>
            <DialogHeader>
              <DialogTitle>{mode === 'completed' ? 'Send completed form' : 'Send form'}</DialogTitle>
              <DialogDescription className="text-sm opacity-80">
                {template?.name || 'Form'}
                {prefillCount > 0 ? ` · ${prefillCount} field${prefillCount === 1 ? '' : 's'} prefilled` : ''}
              </DialogDescription>
            </DialogHeader>

            <div
              className="lead-detail-deal-card lead-detail-list-card pointer-events-none"
              aria-label={`Lead: ${displayLeadName(lead)}`}
            >
              <User className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{displayLeadName(lead)}</div>
                {formatLeadAddress(lead) ? (
                  <div className="text-[11px] text-white/45 truncate mt-0.5">{formatLeadAddress(lead)}</div>
                ) : null}
              </div>
            </div>

            <div
              className={cn(
                'lead-detail-actions-row',
                mode === 'invite' ? 'forms-send-lead-actions-row--three' : 'forms-send-lead-actions-row--one',
              )}
            >
              <LeadContactActionTile
                icon={Mail}
                label="Email"
                values={leadEmails}
                contactDetails={emailDetails}
                contactKind="email"
                onSelect={handleSendEmail}
                pickerTitle="Choose an email"
                disabled={sending}
              />
              {mode === 'invite' ? (
                <>
                  <LeadContactActionTile
                    icon={MessageSquare}
                    label="Text"
                    values={leadPhones}
                    contactDetails={phoneDetails}
                    contactKind="phone"
                    formatValue={formatPhoneDisplay}
                    onSelect={handleSendText}
                    pickerTitle="Choose a number"
                    disabled={sending}
                  />
                  <SendFormActionTile
                    icon={Link2}
                    label="Copy link"
                    onClick={handleCopyLinkClick}
                    disabled={leadEmails.length === 0}
                    loading={activeAction === 'copy' && sending}
                  />
                </>
              ) : null}
            </div>

            <button
              type="button"
              className="w-full share-dialog-btn forms-send-cancel"
              disabled={sending}
              onClick={handleClose}
            >
              Cancel
            </button>

            <LeadContactPickerDialog
              open={copyPickerOpen}
              onOpenChange={setCopyPickerOpen}
              title="Choose an email"
              icon={Mail}
              items={copyPickerItems}
              onSelect={handleCopyLink}
              nestedOverlay
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{mode === 'completed' ? 'Send completed form' : 'Send form'}</DialogTitle>
              <DialogDescription className="text-sm opacity-80">
                {template?.name || 'Form'}
                {prefillCount > 0 ? ` · ${prefillCount} field${prefillCount === 1 ? '' : 's'} prefilled` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <label className="text-xs opacity-60 mb-1 block">Recipient email</label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>

              {mode === 'completed' && (
                <div>
                  <label className="text-xs opacity-60 mb-1 block">Subject</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Completed form"
                  />
                </div>
              )}

              <div>
                <label className="text-xs opacity-60 mb-1 block">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="forms-send-textarea w-full text-sm rounded-lg px-3 py-2 resize-none"
                  placeholder="Add a note for the recipient"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 min-w-0 share-dialog-btn forms-send-cancel"
                disabled={sending}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 min-w-0 share-dialog-btn forms-send-confirm"
                disabled={sending}
                onClick={handleGenericSend}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
                Send
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SendFormDialog
