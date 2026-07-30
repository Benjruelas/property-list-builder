import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, Copy, Mail, MessageSquare, FileText, Link2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
} from '@/utils/leadContact'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { logLeadFormSent } from '@/utils/leadActivity'
import { invalidateCachedLeadForms } from '@/utils/leadForms'
import { displayLeadName } from '@/utils/leads'
import { getSenderDisplayName, getCompanyNameForSends } from '@/utils/profile'
import { SendAsField } from '../shared/SendAsField'
import { AutoResizeTextarea } from '../ui/auto-resize-textarea'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Optional note only — invite emails already include an Open form CTA. */
const DEFAULT_LINK_NOTE = ''

const DEFAULT_TEXT_BODY = `Hi {{clientName}}, please complete this form: {{formLink}}`

function replaceFormTags(template, data) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key]
    return v == null ? '' : String(v)
  })
}

/**
 * Unified form send dialog (matches quote/report send panels).
 * Delivery: link-to-complete (invite) or PDF attachment.
 */
export function SendFormDialog({
  open,
  template,
  prefillValues = null,
  values = null,
  /** Lazy: returns base64 PDF string for attachment mode. */
  preparePdf = null,
  onClose,
  lead = null,
  onSent,
  teams = [],
  teamMembership = null,
  /** Prefer this delivery when opening. */
  initialDelivery = 'link',
}) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [delivery, setDelivery] = useState(initialDelivery === 'pdf' ? 'pdf' : 'link')
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [senderUid, setSenderUid] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [sendMeCopy, setSendMeCopy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [lastLink, setLastLink] = useState('')

  const leadEmails = useMemo(() => (lead ? getLeadEmails(lead) : []), [lead])
  const leadPhones = useMemo(() => (lead ? getLeadPhones(lead) : []), [lead])
  const canPdf = typeof preparePdf === 'function'

  const prefillCount = useMemo(
    () => Object.keys(prefillValues || {}).length,
    [prefillValues],
  )

  const defaultEmail = useMemo(() => {
    if (leadEmails[0]) return leadEmails[0]
    return ''
  }, [leadEmails])

  const defaultPhone = useMemo(() => {
    if (leadPhones[0]) return leadPhones[0]
    return ''
  }, [leadPhones])

  const clientName = useMemo(() => {
    if (lead) return displayLeadName(lead) || 'there'
    const emailLocal = recipient.split('@')[0]
    return emailLocal || 'there'
  }, [lead, recipient])

  const selectedSenderName = useMemo(
    () => getSenderDisplayName(currentUser),
    [currentUser],
  )

  const tagData = useMemo(() => ({
    clientName,
    formName: template?.name || 'Form',
    formLink: lastLink || '[link will appear after send]',
    senderName: selectedSenderName,
    senderEmail: currentUser?.email || '',
    companyName: getCompanyNameForSends(teams, teamMembership),
  }), [clientName, template?.name, lastLink, selectedSenderName, currentUser?.email, teams, teamMembership])

  useEffect(() => {
    if (!open) return
    setTab('email')
    setDelivery(canPdf && initialDelivery === 'pdf' ? 'pdf' : 'link')
    setRecipient('')
    setPhone('')
    setSenderUid(null)
    setSentTo(null)
    setLastLink('')
    setSendMeCopy(false)
    const name = template?.name || 'Form'
    setSubject(`Please complete: ${name}`)
    setBody(DEFAULT_LINK_NOTE)
    setTextBody(DEFAULT_TEXT_BODY)
  }, [open, template?.name, initialDelivery, canPdf])

  useEffect(() => {
    if (!open) return
    setRecipient((prev) => prev.trim() || defaultEmail)
    setPhone((prev) => prev.trim() || defaultPhone)
  }, [open, defaultEmail, defaultPhone])

  useEffect(() => {
    if (!open) return
    if (delivery === 'pdf') {
      setSubject((s) => {
        const name = template?.name || 'Form'
        if (!s || s.startsWith('Please complete:')) return `Form: ${name}`
        return s
      })
    } else {
      setSubject((s) => {
        const name = template?.name || 'Form'
        if (!s || s.startsWith('Form:')) return `Please complete: ${name}`
        return s
      })
    }
  }, [delivery, open, template?.name])

  const handleClose = () => {
    if (sending) return
    setSentTo(null)
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
    } catch {
      /* non-blocking */
    }
  }

  const ensureInviteLink = async ({ email, phone: phoneVal, skipEmail = false } = {}) => {
    const res = await createFormInvite(getToken, {
      templateId: template.id,
      recipientEmail: email || undefined,
      recipientPhone: phoneVal || undefined,
      subject: subject.trim() || undefined,
      message: body.trim() || undefined,
      prefillValues: prefillCount > 0 ? prefillValues : undefined,
      skipEmail,
      senderUid,
      ...leadMeta,
    })
    return res.formLink
  }

  const handleSendEmail = async () => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    if (!template?.id) return
    setSending(true)
    try {
      if (delivery === 'pdf') {
        if (!canPdf) {
          showToast('PDF send is not available here', 'error')
          return
        }
        const pdfBase64 = await preparePdf()
        const payload = buildSendPayload({
          template,
          values: values || prefillValues || {},
          recipient: trimmed,
          subject: subject.trim() || `Form: ${template.name || 'Form'}`,
          message: body.trim(),
          flattenedPdfBase64: pdfBase64,
          sendMeCopy,
        })
        await sendForm(getToken, {
          ...payload,
          ...leadMeta,
          recipientPhone: (phone || '').replace(/\D/g, '').slice(-10) || undefined,
          senderUid,
        })
        setSentTo(trimmed)
        showToast(`Form sent to ${trimmed}`, 'success')
        await logSent(`Sent form PDF: ${template.name || 'Form'}`, {
          channel: 'email',
          recipientEmail: trimmed,
          delivery: 'pdf',
        })
        onSent?.({ delivery: 'pdf', recipientEmail: trimmed })
        return
      }

      const res = await createFormInvite(getToken, {
        templateId: template.id,
        recipientEmail: trimmed,
        recipientPhone: (phone || '').replace(/\D/g, '').slice(-10) || undefined,
        subject: subject.trim() || undefined,
        message: body.trim() || undefined,
        prefillValues: prefillCount > 0 ? prefillValues : undefined,
        senderUid,
        ...leadMeta,
      })
      setLastLink(res.formLink || '')
      setSentTo(trimmed)
      showToast(`Form link sent to ${trimmed}`, 'success')
      await logSent(`Sent form link: ${template.name || 'Form'}`, {
        channel: 'email',
        recipientEmail: trimmed,
        delivery: 'link',
      })
      onSent?.({ delivery: 'link', recipientEmail: trimmed, formLink: res.formLink })
    } catch (e) {
      showToast(e.message || 'Failed to send form', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSendText = async () => {
    const tel = (phone || '').replace(/[^\d+]/g, '')
    if (tel.length < 10) {
      showToast('Enter a valid phone number', 'error')
      return
    }
    if (delivery === 'pdf') {
      showToast('PDF attachments can only be emailed. Switch to Link to complete for text.', 'error')
      return
    }
    if (!template?.id) return

    let link = lastLink
    const email = recipient.trim()
    if (!link) {
      setSending(true)
      try {
        link = await ensureInviteLink({
          phone: tel.slice(-10),
          email: EMAIL_RE.test(email) ? email : undefined,
          skipEmail: true,
        })
        setLastLink(link)
      } catch (e) {
        showToast(e.message || 'Failed to generate link', 'error')
        setSending(false)
        return
      }
      setSending(false)
    }

    const msg = replaceFormTags(textBody, { ...tagData, formLink: link, clientName })
    window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`
    showToast('Opening SMS…', 'success')
    await logSent(`Sent form link via text: ${template.name || 'Form'}`, {
      channel: 'text',
      recipientPhone: tel.slice(-10),
      delivery: 'link',
    })
    setSentTo(formatPhoneDisplay(tel.slice(-10)))
    onSent?.({ delivery: 'link', recipientPhone: tel.slice(-10), formLink: link })
  }

  const handleCopyLink = async () => {
    let link = lastLink
    if (!link) {
      const email = recipient.trim() || defaultEmail
      if (!EMAIL_RE.test(email) && !(phone || defaultPhone)) {
        showToast('Enter a recipient email to generate a link', 'error')
        return
      }
      setSending(true)
      try {
        link = await ensureInviteLink({
          email: EMAIL_RE.test(email) ? email : undefined,
          phone: (phone || defaultPhone || '').replace(/\D/g, '').slice(-10) || undefined,
          skipEmail: true,
        })
        setLastLink(link)
      } catch (e) {
        showToast(e.message || 'Could not generate link', 'error')
        setSending(false)
        return
      }
      setSending(false)
    }
    try {
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch {
      showToast('Could not copy link', 'error')
    }
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog forms-send-dialog send-form-dialog w-[min(96vw,40rem)] max-w-2xl max-h-[min(90vh,820px)] overflow-y-auto rounded-xl p-6 gap-4"
        focusOverlay
        topLayer
        confirmLayer
        data-send-form-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>Form sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90 leading-relaxed">
                  to: {sentTo}
                </DialogDescription>
              </div>
            </DialogHeader>
            {lastLink ? (
              <Button variant="outline" className="w-full" onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
            ) : null}
            <DialogFooter>
              <Button className="w-full create-list-btn" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send form</DialogTitle>
              <DialogDescription className="text-sm opacity-80">
                {template.name || 'Form'}
                {prefillCount > 0
                  ? ` · ${prefillCount} field${prefillCount === 1 ? '' : 's'} prefilled`
                  : ''}
                {lead ? ` · ${displayLeadName(lead)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
              {[
                { id: 'link', label: 'Link to complete', icon: Link2, disabled: false },
                { id: 'pdf', label: 'PDF attachment', icon: FileText, disabled: !canPdf },
              ].map(({ id, label, icon: Icon, disabled }) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm transition-colors disabled:opacity-40',
                    delivery === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/90',
                  )}
                  onClick={() => setDelivery(id)}
                  title={disabled ? 'Open the form fill view to send a filled PDF' : undefined}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {delivery === 'link' ? (
              <p className="text-xs opacity-65 leading-relaxed">
                Recipient opens a one-time link to finish the form. When they submit, you both get the completed PDF. You&apos;ll be notified when it&apos;s viewed and completed.
              </p>
            ) : (
              <p className="text-xs opacity-65 leading-relaxed">
                Email the current form as a PDF attachment (no completion link).
              </p>
            )}

            <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
              {[
                { id: 'email', label: 'Email', icon: Mail },
                { id: 'text', label: 'Text', icon: MessageSquare },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm transition-colors',
                    tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/90',
                    delivery === 'pdf' && id === 'text' && 'opacity-40',
                  )}
                  onClick={() => {
                    if (delivery === 'pdf' && id === 'text') {
                      showToast('PDF attachments can only be emailed', 'error')
                      return
                    }
                    setTab(id)
                  }}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {tab === 'email' ? (
              <div className="space-y-3">
                <SendAsField
                  currentUser={currentUser}
                  teams={teams}
                  senderUid={senderUid}
                  onChangeSenderUid={setSenderUid}
                  disabled={sending}
                />
                <Input
                  placeholder="Recipient email"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <AutoResizeTextarea
                  className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                  placeholder={delivery === 'pdf' ? 'Optional message' : 'Optional note for the recipient'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  minRows={3}
                />
                {delivery === 'pdf' ? (
                  <label className="flex items-center gap-2 text-sm opacity-95 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendMeCopy}
                      onChange={(e) => setSendMeCopy(e.target.checked)}
                      className="h-4 w-4 accent-blue-600 cursor-pointer"
                    />
                    Send me a copy
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <SendAsField
                  currentUser={currentUser}
                  teams={teams}
                  senderUid={senderUid}
                  onChangeSenderUid={setSenderUid}
                  disabled={sending}
                />
                <Input
                  placeholder="Client phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <AutoResizeTextarea
                  className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                  placeholder="Text message"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  minRows={3}
                />
                <p className="text-xs opacity-60">
                  Opens your device SMS app with the completion link.
                </p>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {tab === 'email' ? (
                <Button className="w-full create-list-btn" disabled={sending} onClick={handleSendEmail}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  {delivery === 'pdf' ? 'Send PDF' : 'Send email'}
                </Button>
              ) : (
                <Button className="w-full create-list-btn" disabled={sending} onClick={handleSendText}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Send via SMS
                </Button>
              )}
              {delivery === 'link' ? (
                <Button variant="outline" className="w-full" disabled={sending} onClick={handleCopyLink}>
                  <Copy className="h-4 w-4 mr-2" /> Copy link
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="w-full opacity-70" disabled={sending} onClick={handleClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SendFormDialog
