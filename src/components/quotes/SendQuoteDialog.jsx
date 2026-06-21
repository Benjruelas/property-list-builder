import { useState, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, Copy, MessageSquare, Mail } from 'lucide-react'
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
import { sendQuoteEmail, buildQuotePublicUrl } from '../../utils/quotes'
import {
  QUOTE_SEND_TAGS,
  replaceQuoteTags,
  getQuoteSendTemplatesFromSettings,
  buildQuoteSendTemplatesPatch,
} from '../../utils/quoteSendTemplates'
import { formatQuoteMoney } from '../../utils/quoteMath'
import { getSettings, updateSettings } from '../../utils/settings'
import { getSenderDisplayName, getCompanyNameForSends } from '../../utils/profile'
import { cn } from '@/lib/utils'
import { AutoResizeTextarea } from '../ui/auto-resize-textarea'
import { findLeadById } from '../../utils/leads'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendQuoteDialog({ open, quote, onClose, onSent, leads = [], teams = [], teamMembership = null }) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [lastLink, setLastLink] = useState('')

  const linkedLead = useMemo(
    () => findLeadById(leads, quote?.leadId),
    [quote?.leadId, leads]
  )

  const defaultRecipientEmail = useMemo(() => {
    const leadEmail = (linkedLead?.email || '').trim()
    if (leadEmail) return leadEmail
    return (quote?.clientEmail || '').trim()
  }, [linkedLead?.email, quote?.clientEmail])

  const defaultPhone = useMemo(() => {
    const leadPhone = (linkedLead?.phone || '').trim()
    if (leadPhone) return leadPhone
    return (quote?.clientPhone || '').trim()
  }, [linkedLead?.phone, quote?.clientPhone])

  const tagData = useMemo(() => ({
    clientName: linkedLead
      ? `${linkedLead.firstName || ''} ${linkedLead.lastName || ''}`.trim() || linkedLead.address?.split(',')[0] || 'there'
      : quote?.clientName || recipient.split('@')[0] || 'there',
    quoteTitle: quote?.title || 'Quote',
    quoteTotal: quote?.total,
    quoteLink: lastLink || '[link will appear after send]',
    senderName: getSenderDisplayName(currentUser),
    senderEmail: currentUser?.email,
    validUntil: quote?.validUntil?.slice(0, 10) || '',
    companyName: getCompanyNameForSends(teams, teamMembership),
  }), [quote, linkedLead, recipient, lastLink, currentUser, teams, teamMembership])

  useEffect(() => {
    if (!open || !quote?.id) return
    setTab('email')
    setRecipient('')
    setPhone('')
    setSentTo(null)
    setLastLink('')
    const templates = getQuoteSendTemplatesFromSettings(getSettings())
    setSubject(templates.email.subject)
    setBody(templates.email.body)
    setTextBody(templates.text.body)
  }, [open, quote?.id])

  useEffect(() => {
    if (!open || !quote?.id) return
    setRecipient((prev) => prev.trim() || defaultRecipientEmail)
    setPhone((prev) => prev.trim() || defaultPhone)
  }, [open, quote?.id, defaultRecipientEmail, defaultPhone])

  const resetAndClose = () => {
    if (sending) return
    setSentTo(null)
    onClose?.()
  }

  const handleSaveDefaults = () => {
    setSavingDefault(true)
    try {
      const patch = buildQuoteSendTemplatesPatch({ subject, body }, { body: textBody })
      updateSettings(patch, getToken)
      showToast('Message templates saved', 'success')
    } finally {
      setSavingDefault(false)
    }
  }

  const handleSendEmail = async () => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    if (!quote?.id) return
    setSending(true)
    try {
      const res = await sendQuoteEmail(getToken, {
        quoteId: quote.id,
        recipientEmail: trimmed,
        subject: replaceQuoteTags(subject, { ...tagData, clientName: quote.clientName || trimmed.split('@')[0] }),
        message: replaceQuoteTags(body, { ...tagData, quoteLink: '{{quoteLink}}' }),
        recipientPhone: phone.trim() || undefined,
      })
      setLastLink(res.quoteLink || '')
      setSentTo(trimmed)
      showToast(`Quote sent to ${trimmed}`, 'success')
      onSent?.(res.quote)
    } catch (e) {
      showToast(e.message || 'Failed to send quote', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSendText = async () => {
    const tel = (phone || '').replace(/[^\d+]/g, '')
    if (!tel) {
      showToast('Enter a client phone number', 'error')
      return
    }
    let link = lastLink
    const email = (recipient.trim() || quote?.clientEmail || '').trim()
    if (!link) {
      if (!EMAIL_RE.test(email)) {
        showToast('Enter a valid client email to generate a quote link', 'error')
        return
      }
      setSending(true)
      try {
        const res = await sendQuoteEmail(getToken, {
          quoteId: quote.id,
          recipientEmail: email,
          generateOnly: true,
          recipientPhone: tel,
        })
        link = res.quoteLink
        setLastLink(link)
      } catch (e) {
        showToast(e.message || 'Failed to generate link', 'error')
        setSending(false)
        return
      }
      setSending(false)
    }
    const msg = replaceQuoteTags(textBody, { ...tagData, quoteLink: link })
    window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`
    showToast('Opening SMS…', 'success')
  }

  const handleCopyLink = async () => {
    if (!lastLink) {
      showToast('Send via email first to generate a link', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(lastLink)
      showToast('Link copied', 'success')
    } catch {
      showToast('Could not copy link', 'error')
    }
  }

  const insertTag = (tag, field) => {
    if (field === 'subject') setSubject((s) => s + tag)
    else if (field === 'body') setBody((s) => s + tag)
    else setTextBody((s) => s + tag)
  }

  if (!quote) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog send-quote-dialog w-[min(96vw,40rem)] max-w-2xl max-h-[min(90vh,820px)] overflow-y-auto rounded-xl p-6 gap-4"
        focusOverlay
        topLayer
        confirmLayer
        data-send-quote-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <DialogTitle>Quote sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90">to: {sentTo}</DialogDescription>
              </div>
            </DialogHeader>
            {lastLink && (
              <Button variant="outline" className="w-full" onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
            )}
            <DialogFooter>
              <Button className="w-full create-list-btn" onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send quote</DialogTitle>
              <DialogDescription className="text-sm opacity-80">
                {quote.title} — {formatQuoteMoney(quote.total)}
              </DialogDescription>
            </DialogHeader>

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
                    tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/90'
                  )}
                  onClick={() => setTab(id)}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1">
              {QUOTE_SEND_TAGS.map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/15"
                  onClick={() => insertTag(tag, tab === 'email' ? 'body' : 'text')}
                  title={label}
                >
                  {tag}
                </button>
              ))}
            </div>

            {tab === 'email' ? (
              <div className="space-y-3">
                <Input placeholder="Recipient email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <AutoResizeTextarea
                  className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                  placeholder="Email body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  minRows={3}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <Input placeholder="Client phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <AutoResizeTextarea
                  className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                  placeholder="Text message"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  minRows={3}
                />
                <p className="text-xs opacity-60">Opens your device SMS app. Send email first to generate the quote link, or copy link after email send.</p>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {tab === 'email' ? (
                <Button className="w-full create-list-btn" disabled={sending} onClick={handleSendEmail}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send email
                </Button>
              ) : (
                <>
                  <Button className="w-full create-list-btn" onClick={handleSendText}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Send via SMS
                  </Button>
                  {lastLink && (
                    <Button variant="outline" className="w-full" onClick={handleCopyLink}>
                      <Copy className="h-4 w-4 mr-2" /> Copy link
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" className="w-full opacity-70" disabled={savingDefault} onClick={handleSaveDefaults}>
                Save as default template
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
