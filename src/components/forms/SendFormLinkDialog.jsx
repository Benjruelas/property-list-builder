import { useMemo, useState } from 'react'
import { Loader2, Link2, CheckCircle2 } from 'lucide-react'
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
import { createFormInvite } from '../../utils/forms'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendFormLinkDialog({ open, template, prefillValues, onClose }) {
  const { getToken } = useAuth()
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)

  const prefillCount = useMemo(
    () => Object.keys(prefillValues || {}).length,
    [prefillValues]
  )

  const resetForm = () => {
    setRecipient('')
    setMessage('')
    setSentTo(null)
  }

  const handleClose = () => {
    if (sending) return
    resetForm()
    onClose?.()
  }

  const handleSend = async () => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    if (!template?.id) return
    setSending(true)
    try {
      await createFormInvite(getToken, {
        templateId: template.id,
        recipientEmail: trimmed,
        message: message.trim() || undefined,
        prefillValues: prefillCount > 0 ? prefillValues : undefined,
      })
      setSentTo(trimmed)
      showToast(`Request sent to ${trimmed}`, 'success')
    } catch (e) {
      showToast(e.message || 'Failed to send form link', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog forms-send-dialog w-[min(92vw,22rem)] max-w-sm max-h-[min(88vh,640px)] overflow-y-auto rounded-xl p-6 gap-4"
        focusOverlay
        topLayer
        confirmLayer
      >
        {sentTo ? (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>Request sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90 leading-relaxed">
                  to: {sentTo}
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full share-dialog-btn forms-send-confirm"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request Completion</DialogTitle>
              <DialogDescription className="text-sm opacity-90 leading-relaxed">
                {prefillCount > 0
                  ? `Email a link with your ${prefillCount} filled field${prefillCount === 1 ? '' : 's'}. The recipient completes the rest. Expires in 30 days.`
                  : 'Email a one-time link for the recipient to complete this form. Expires in 30 days.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <label className="block text-sm font-medium opacity-95">
                Recipient email
                <Input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1.5"
                />
              </label>
              <label className="block text-sm font-medium opacity-95">
                Message (optional)
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="forms-send-textarea mt-1.5 flex w-full rounded-md px-3 py-2 text-sm focus-visible:outline-none"
                  placeholder="Add a note for the recipient…"
                />
              </label>
            </div>

            <DialogFooter className="gap-2 sm:flex-row flex-col-reverse">
              <Button variant="outline" onClick={handleClose} disabled={sending} className="flex-1 min-w-0 share-dialog-btn forms-send-cancel">
                Cancel
              </Button>
              <Button variant="outline" onClick={handleSend} disabled={sending} className="flex-1 min-w-0 share-dialog-btn forms-send-confirm">
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                Send link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SendFormLinkDialog
