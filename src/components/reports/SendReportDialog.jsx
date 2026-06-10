import { useState, useEffect, useMemo } from 'react'
import { Loader2, Copy, MessageSquare, Mail } from 'lucide-react'
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
import { sendPhotoReportEmail, buildReportPublicUrl } from '../../utils/photoReports'
import {
  REPORT_SEND_TAGS,
  replaceReportTags,
  getReportSendTemplatesFromSettings,
  buildReportSendTemplatesPatch,
  DEFAULT_REPORT_EMAIL_SUBJECT,
  DEFAULT_REPORT_EMAIL_BODY,
  DEFAULT_REPORT_TEXT_BODY,
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
    if (!open) return
    const t = getReportSendTemplatesFromSettings()
    setSubject(replaceReportTags(t.emailSubject, tagData))
    setBody(replaceReportTags(t.emailBody, tagData))
    setTextBody(replaceReportTags(t.textBody, tagData))
    setRecipient(linkedLead?.email || '')
    setPhone(linkedLead?.phone || '')
    setLastLink('')
  }, [open, report?.id, linkedLead?.id])

  useEffect(() => {
    const t = getReportSendTemplatesFromSettings()
    setSubject(replaceReportTags(t.emailSubject, tagData))
    setBody(replaceReportTags(t.emailBody, tagData))
    setTextBody(replaceReportTags(t.textBody, tagData))
  }, [lastLink, tagData])

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
    if (!EMAIL_RE.test(recipient.trim())) {
      showToast('Enter a valid email', 'error')
      return
    }
    setSending(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        recipientEmail: recipient.trim(),
        subject: subject.trim(),
        message: body.trim(),
      })
      setLastLink(res.publicUrl || buildReportPublicUrl(res.token))
      showToast(`Sent to ${res.sentTo}`, 'success')
      onSent?.(res.report)
    } catch (e) {
      showToast(e.message || 'Send failed', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleCopyText = async () => {
    const text = replaceReportTags(textBody, { ...tagData, ReportLink: lastLink || tagData.ReportLink })
    try {
      await navigator.clipboard.writeText(text)
      showToast('Text copied — paste in Messages', 'success')
    } catch {
      showToast('Could not copy', 'error')
    }
  }

  const handleGenerateLink = async () => {
    setSending(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        recipientEmail: currentUser?.email || 'link@knockscout.local',
        subject: subject.trim(),
        message: body.trim(),
        generateOnly: true,
      })
      setLastLink(res.publicUrl || buildReportPublicUrl(res.token))
      showToast('Link ready for texting', 'success')
    } catch (e) {
      showToast(e.message || 'Failed', 'error')
    } finally {
      setSending(false)
    }
  }

  if (!report) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="map-panel max-w-lg p-0" nestedOverlay topLayer data-send-report-dialog>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
          <DialogTitle>Send photo report</DialogTitle>
          <DialogDescription className="sr-only">Email or text report link</DialogDescription>
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
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm min-h-[120px] lead-detail-field" placeholder="Email body" />
              <Button type="button" className="w-full min-h-[44px]" onClick={handleSendEmail} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send email with PDF'}
              </Button>
            </>
          ) : (
            <>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (for your reference)" className="min-h-[44px] bg-white/5 border-white/15" />
              <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} rows={5} className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm lead-detail-field" />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 min-h-[44px]" onClick={handleGenerateLink} disabled={sending}>
                  Get link
                </Button>
                <Button type="button" className="flex-1 min-h-[44px]" onClick={handleCopyText}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy text
                </Button>
              </div>
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
      </DialogContent>
    </Dialog>
  )
}
