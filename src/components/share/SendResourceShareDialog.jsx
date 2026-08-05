import { useState, useEffect, useCallback } from 'react'
import { Loader2, Copy, MessageSquare, Mail, CheckCircle2 } from 'lucide-react'
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
import {
  createResourceShareLink,
  sendResourceShareEmail,
} from '@/utils/resourceShare'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SEGMENT_BTN =
  'send-form-btn flex-1 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors'

function openSmsWithBody(body) {
  const encoded = encodeURIComponent(body)
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent)
  window.location.href = isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`
}

/**
 * External share via text / email / copy link for a Lead or Deal.
 * @param {'lead'|'deal'} type
 */
export function SendResourceShareDialog({
  open,
  onClose,
  type = 'lead',
  lead = null,
  deal = null,
  pipelineId = null,
}) {
  const { getToken } = useAuth()
  const [tab, setTab] = useState('text')
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [lastLink, setLastLink] = useState('')
  const [sentTo, setSentTo] = useState('')

  const resourceLabel = type === 'deal'
    ? (deal?.title || deal?.leadName || 'Deal')
    : displayLeadName(lead)
  const address = type === 'deal'
    ? (deal?.leadAddress || formatLeadAddress(lead) || '')
    : (formatLeadAddress(lead) || '')

  const resetAndClose = useCallback(() => {
    setTab('text')
    setRecipient('')
    setSubject('')
    setMessage('')
    setSending(false)
    setLinkBusy(false)
    setLastLink('')
    setSentTo('')
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const name = resourceLabel || (type === 'deal' ? 'Deal' : 'Lead')
    setSubject(`${name} shared with you on KnockScout`)
    setMessage(`I shared a ${type} with you on KnockScout:${address ? `\n${address}` : ''}\n\nOpen the link to add it to your account.`)
    // Recipient email is for the person you're sharing *to* — never prefill from the lead.
    setRecipient('')
  }, [open, resourceLabel, address, type])

  const ensureLink = async () => {
    if (lastLink) return lastLink
    setLinkBusy(true)
    try {
      const res = await createResourceShareLink(getToken, {
        type,
        leadId: type === 'lead' ? lead?.id : undefined,
        dealId: type === 'deal' ? deal?.id : undefined,
        pipelineId: type === 'deal' ? (pipelineId || deal?.pipelineId || null) : undefined,
      })
      const link = res.shareLink || ''
      setLastLink(link)
      return link
    } finally {
      setLinkBusy(false)
    }
  }

  const handleSendEmail = async () => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    setSending(true)
    try {
      const res = await sendResourceShareEmail(getToken, {
        type,
        leadId: type === 'lead' ? lead?.id : undefined,
        dealId: type === 'deal' ? deal?.id : undefined,
        pipelineId: type === 'deal' ? (pipelineId || deal?.pipelineId || null) : undefined,
        recipientEmail: trimmed,
        subject,
        message,
      })
      setLastLink(res.shareLink || '')
      setSentTo(trimmed)
      showToast(`Share sent to ${trimmed}`, 'success')
    } catch (e) {
      showToast(e.message || 'Failed to send email', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSendText = async () => {
    setSending(true)
    try {
      const link = await ensureLink()
      if (!link) {
        showToast('Failed to generate link', 'error')
        return
      }
      openSmsWithBody(link)
      showToast('Opening Messages…', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to generate link', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleCopyLink = async () => {
    setSending(true)
    try {
      const link = await ensureLink()
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch (e) {
      showToast(e.message || 'Could not copy link', 'error')
    } finally {
      setSending(false)
    }
  }

  const busy = sending || linkBusy
  const title = type === 'deal' ? 'Share deal' : 'Share lead'
  if (!open) return null
  if (type === 'lead' && !lead?.id) return null
  if (type === 'deal' && !deal?.id) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog send-report-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full md:max-w-2xl"
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-resource-share-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <DialogTitle>Share sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90">to: {sentTo}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-6 pb-4 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <Button
                variant="outline"
                className="send-form-btn w-full min-h-[44px]"
                onClick={handleCopyLink}
                disabled={busy}
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy link
              </Button>
            </div>
            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <Button variant="outline" className="send-form-btn send-form-btn--primary w-full min-h-[44px]" onClick={resetAndClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-sm text-white/60">
                {resourceLabel}{address ? ` · ${address}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 flex gap-2 mb-3 flex-shrink-0">
              <button
                type="button"
                className={`${SEGMENT_BTN} ${tab === 'text' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/70'}`}
                onClick={() => setTab('text')}
              >
                <MessageSquare className="h-4 w-4" /> Text
              </button>
              <button
                type="button"
                className={`${SEGMENT_BTN} ${tab === 'email' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/70'}`}
                onClick={() => setTab('email')}
              >
                <Mail className="h-4 w-4" /> Email
              </button>
            </div>

            <div className="px-6 pb-4 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              {tab === 'email' ? (
                <>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="share-email">Email</label>
                    <Input
                      id="share-email"
                      type="email"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className={TEXT_INPUT}
                      placeholder="name@example.com"
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="share-subject">Subject</label>
                    <Input
                      id="share-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className={TEXT_INPUT}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="share-message">Message</label>
                    <textarea
                      id="share-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className={`${TEXT_INPUT} min-h-[8rem]`}
                      disabled={busy}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-white/60">
                  Opens Messages so you can choose a contact.
                </p>
              )}

              <Button
                variant="outline"
                className="send-form-btn w-full min-h-[44px]"
                onClick={handleCopyLink}
                disabled={busy}
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy link
              </Button>
            </div>

            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0 gap-2"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <Button variant="outline" className="send-form-btn flex-1 min-h-[44px]" onClick={resetAndClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="outline"
                className="send-form-btn send-form-btn--primary flex-1 min-h-[44px]"
                onClick={tab === 'email' ? handleSendEmail : handleSendText}
                disabled={busy}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {tab === 'email' ? 'Send email' : 'Open Messages'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SendResourceShareDialog
