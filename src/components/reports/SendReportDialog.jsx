import { useState, useEffect, useMemo } from 'react'
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
import { sendPhotoReportEmail, buildReportPublicUrl } from '../../utils/photoReports'
import {
  REPORT_SEND_TAGS,
  replaceReportTags,
  getReportSendTemplatesFromSettings,
  buildReportSendTemplatesPatch,
} from '../../utils/reportSendTemplates'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { getSenderDisplayName, getCompanyNameForSends } from '../../utils/profile'
import { getSettings, updateSettings } from '../../utils/settings'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendReportDialog({ open, report, onClose, onSent, leads = [], teams = [], teamMembership = null }) {
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
    () => (report?.leadId ? leads.find((l) => l.id === report.leadId) : null),
    [report?.leadId, leads]
  )

  const tagData = useMemo(() => ({
    ClientName: linkedLead ? displayLeadName(linkedLead) : 'there',
    ReportTitle: report?.title || 'Photo Report',
    ReportLink: lastLink || '[link will appear after send]',
    SenderName: getSenderDisplayName(currentUser),
    CompanyName: getCompanyNameForSends(teams, teamMembership),
    LeadAddress: linkedLead ? formatLeadAddress(linkedLead) : '',
  }), [report, linkedLead, lastLink, currentUser, teams, teamMembership])

  useEffect(() => {
    if (!open || !report) return
    setTab('email')
    setRecipient(linkedLead?.email || '')
    setPhone(linkedLead?.phone || '')
    setSentTo(null)
    setLastLink('')
    const t = getReportSendTemplatesFromSettings()
    setSubject(replaceReportTags(t.emailSubject, tagData))
    setBody(replaceReportTags(t.emailBody, tagData))
    setTextBody(replaceReportTags(t.textBody, tagData))
  }, [open, report?.id, linkedLead?.id])

  useEffect(() => {
    if (!open) return
    const t = getReportSendTemplatesFromSettings()
    setSubject(replaceReportTags(t.emailSubject, tagData))
    setBody(replaceReportTags(t.emailBody, tagData))
    setTextBody(replaceReportTags(t.textBody, tagData))
  }, [lastLink, tagData, open])

  const resetAndClose = () => {
    if (sending) return
    setSentTo(null)
    onClose?.()
  }

  const handleSaveDefault = async () => {
    setSavingDefault(true)
    try {
      await updateSettings(buildReportSendTemplatesPatch({ emailSubject: subject, emailBody: body, textBody }), getToken)
      showToast('Templates saved', 'success')
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
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
    setSending(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        recipientEmail: trimmed,
        subject: replaceReportTags(subject, tagData),
        message: replaceReportTags(body, { ...tagData, ReportLink: '{{ReportLink}}' }),
      })
      setLastLink(res.publicUrl || buildReportPublicUrl(res.token))
      setSentTo(trimmed)
      showToast(`Report sent to ${trimmed}`, 'success')
      onSent?.(res.report)
    } catch (e) {
      showToast(e.message || 'Send failed', 'error')
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
    const email = (recipient.trim() || linkedLead?.email || '').trim()
    if (!link) {
      if (!EMAIL_RE.test(email)) {
        showToast('Enter a valid client email to generate a report link', 'error')
        return
      }
      setSending(true)
      try {
        const res = await sendPhotoReportEmail(getToken, {
          reportId: report.id,
          recipientEmail: email,
          generateOnly: true,
        })
        link = res.publicUrl || buildReportPublicUrl(res.token)
        setLastLink(link)
      } catch (e) {
        showToast(e.message || 'Failed to generate link', 'error')
        setSending(false)
        return
      }
      setSending(false)
    }
    const msg = replaceReportTags(textBody, { ...tagData, ReportLink: link })
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

  if (!report) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent className="map-panel max-w-lg p-0" nestedOverlay topLayer data-send-report-dialog>
        {sentTo ? (
          <>
            <DialogHeader className="px-5 pt-5 pb-3">
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <DialogTitle>Report sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90">to: {sentTo}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-5 pb-4">
              {lastLink && (
                <Button variant="outline" className="w-full min-h-[44px]" onClick={handleCopyLink}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </Button>
              )}
            </div>
            <DialogFooter className="px-5 pb-5">
              <Button className="w-full create-list-btn min-h-[44px]" onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
              <DialogTitle>Send photo report</DialogTitle>
              <DialogDescription className="text-sm opacity-80">
                {report.title || 'Photo Report'}
                {linkedLead ? ` — ${displayLeadName(linkedLead)}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-4 space-y-4">
              <div className="flex gap-2">
                {['email', 'text'].map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      'flex-1 min-h-[44px] rounded-lg border text-sm font-medium flex items-center justify-center gap-2',
                      tab === id ? 'border-white/30 bg-white/10' : 'border-white/10 opacity-70'
                    )}
                    onClick={() => setTab(id)}
                  >
                    {id === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                    {id === 'email' ? 'Email' : 'Text'}
                  </button>
                ))}
              </div>

              {tab === 'email' ? (
                <>
                  <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient email" className="min-h-[44px] bg-white/5 border-white/15" />
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="min-h-[44px] bg-white/5 border-white/15" />
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm min-h-[120px] lead-detail-field" placeholder="Email body (link is added automatically)" />
                  <Button type="button" className="w-full min-h-[44px] create-list-btn" onClick={handleSendEmail} disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send email with link'}
                  </Button>
                </>
              ) : (
                <>
                  <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Client email (for link)" className="min-h-[44px] bg-white/5 border-white/15" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Client phone" className="min-h-[44px] bg-white/5 border-white/15" />
                  <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} rows={5} className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm lead-detail-field" />
                  <Button type="button" className="w-full min-h-[44px] create-list-btn" onClick={handleSendText} disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open SMS with link'}
                  </Button>
                </>
              )}

              <div className="text-[10px] opacity-50 flex flex-wrap gap-1">
                {REPORT_SEND_TAGS.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-white/5">{t}</span>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleSaveDefault} disabled={savingDefault}>
                Save as default template
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
