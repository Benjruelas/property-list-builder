import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { PanelHeader } from '../ui/panel-header'
import { showToast } from '../ui/toast'
import { useAuth } from '../../contexts/AuthContext'
import { sendPhotoReportEmail, buildReportPublicUrl } from '../../utils/photoReports'
import { parseReportTokenFromPublicUrl } from '@/utils/publicLinks'
import {
  replaceReportTags,
  applyReportLinkToText,
  getReportSendTemplatesFromSettings,
  buildReportSendTemplatesPatch,
} from '../../utils/reportSendTemplates'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { getSenderDisplayName, getCompanyNameForSends } from '../../utils/profile'
import { updateSettings } from '../../utils/settings'
import { normalizeEmailAddress } from '@/utils/outreachAttachments'
import { getAllTeamMembers } from '@/utils/teamTaskUtils'
import { OutreachCcField } from '../outreach/OutreachCcField'
import { SendAsField } from '../shared/SendAsField'
import { memberPrimaryLabel } from '@/components/pickers/entityPickerShared'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REPORT_LINK_TAG = '{ReportLink}'

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const MESSAGE_TEXTAREA = 'w-full min-h-[240px] p-3 border border-white/15 rounded-lg bg-white/5 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'

export function SendReportDialog({ open, report, onClose, onSent, leads = [], teams = [], teamMembership = null }) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [senderUid, setSenderUid] = useState(null)
  const [ccEmails, setCcEmails] = useState([])
  const [sendMeCopy, setSendMeCopy] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [sending, setSending] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [lastLink, setLastLink] = useState('')
  const initSessionRef = useRef(null)

  const teamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const selectedSender = useMemo(() => {
    if (!senderUid || senderUid === currentUser?.uid) {
      return { name: getSenderDisplayName(currentUser), email: currentUser?.email || '' }
    }
    const member = teamMembers.find((m) => m.uid === senderUid)
    return {
      name: member ? memberPrimaryLabel(member) : getSenderDisplayName(currentUser),
      email: member?.email || '',
    }
  }, [senderUid, currentUser, teamMembers])

  const linkedLead = useMemo(
    () => (report?.leadId ? leads.find((l) => l.id === report.leadId) : null),
    [report?.leadId, leads]
  )

  const baseTagData = useMemo(() => ({
    ClientName: linkedLead ? displayLeadName(linkedLead) : 'there',
    ReportTitle: report?.title || 'Photo Report',
    SenderName: selectedSender.name,
    CompanyName: getCompanyNameForSends(teams, teamMembership),
    LeadAddress: linkedLead ? formatLeadAddress(linkedLead) : '',
  }), [report, linkedLead, selectedSender, teams, teamMembership])

  const tagData = useMemo(() => ({
    ...baseTagData,
    ReportLink: lastLink || REPORT_LINK_TAG,
  }), [baseTagData, lastLink])

  const resolvedCcEmails = useMemo(() => {
    const seen = new Set()
    const to = normalizeEmailAddress(recipient)
    return (ccEmails || []).map(normalizeEmailAddress).filter((email) => {
      if (!email || email === to || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [ccEmails, recipient])

  const loadTemplates = useCallback((link = '') => {
    const t = getReportSendTemplatesFromSettings()
    const data = {
      ...baseTagData,
      ReportLink: link || REPORT_LINK_TAG,
    }
    setSubject(replaceReportTags(t.emailSubject, data))
    setBody(replaceReportTags(t.emailBody, data))
    setTextBody(replaceReportTags(t.textBody, data))
  }, [baseTagData])

  const applyLinkToMessages = useCallback((link) => {
    if (!link) return
    setBody((prev) => applyReportLinkToText(prev, link))
    setTextBody((prev) => applyReportLinkToText(prev, link))
  }, [])

  const mintReportLink = useCallback(async () => {
    setGeneratingLink(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        generateOnly: true,
        token: parseReportTokenFromPublicUrl(lastLink) || report.publicToken || undefined,
        senderUid: senderUid || undefined,
      })
      const link = res.publicUrl || buildReportPublicUrl(res.token)
      setLastLink(link)
      applyLinkToMessages(link)
      return link
    } finally {
      setGeneratingLink(false)
    }
  }, [getToken, report?.id, applyLinkToMessages, lastLink, senderUid])

  useEffect(() => {
    if (!open) {
      initSessionRef.current = null
      setGeneratingLink(false)
      return undefined
    }
    if (!report) return undefined

    const sessionKey = report.id
    if (initSessionRef.current === sessionKey) return undefined
    initSessionRef.current = sessionKey

    setTab('email')
    setRecipient(linkedLead?.email || '')
    setPhone(linkedLead?.phone || '')
    setSenderUid(report.displaySenderUid || null)
    setCcEmails([])
    setSendMeCopy(false)
    setSentTo(null)

    const existingLink = report.publicToken ? buildReportPublicUrl(report.publicToken) : ''
    setLastLink(existingLink)

    const initialSenderUid = report.displaySenderUid || null
    let initialSenderName = getSenderDisplayName(currentUser)
    if (initialSenderUid && initialSenderUid !== currentUser?.uid) {
      const member = teamMembers.find((m) => m.uid === initialSenderUid)
      if (member) initialSenderName = memberPrimaryLabel(member)
    } else if (report.createdByName) {
      initialSenderName = report.createdByName
    }

    // Load templates once from current tag data (avoid effect churn from loadTemplates identity)
    const t = getReportSendTemplatesFromSettings()
    const data = {
      ClientName: linkedLead ? displayLeadName(linkedLead) : 'there',
      ReportTitle: report?.title || 'Photo Report',
      SenderName: initialSenderName,
      CompanyName: getCompanyNameForSends(teams, teamMembership),
      LeadAddress: linkedLead ? formatLeadAddress(linkedLead) : '',
      ReportLink: existingLink || REPORT_LINK_TAG,
    }
    setSubject(replaceReportTags(t.emailSubject, data))
    setBody(replaceReportTags(t.emailBody, data))
    setTextBody(replaceReportTags(t.textBody, data))

    let cancelled = false

    const bootstrapLink = async () => {
      setGeneratingLink(true)
      try {
        const res = await sendPhotoReportEmail(getToken, {
          reportId: report.id,
          generateOnly: true,
          token: report.publicToken || parseReportTokenFromPublicUrl(existingLink) || undefined,
          senderUid: initialSenderUid || undefined,
        })
        if (cancelled) return
        const link = res.publicUrl || buildReportPublicUrl(res.token)
        setLastLink(link)
        applyLinkToMessages(link)
      } catch (e) {
        if (!cancelled) showToast(e.message || 'Could not create report link', 'error')
      } finally {
        // Always clear — if this run was cancelled, a newer open may also set it,
        // but leaving it true permanently disables Send.
        setGeneratingLink(false)
      }
    }

    bootstrapLink()
    return () => { cancelled = true }
  // Intentionally omit loadTemplates / baseTagData — their identity churn was cancelling
  // bootstrap and leaving generatingLink stuck true.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, report?.id, linkedLead?.id, getToken, applyLinkToMessages, currentUser, teams, teamMembership])

  const resetAndClose = () => {
    if (sending) return
    setGeneratingLink(false)
    setSentTo(null)
    onClose?.()
  }

  const ensureReportLink = async () => {
    if (lastLink) return lastLink
    return mintReportLink()
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
    if (!report?.id) {
      showToast('Report is missing', 'error')
      return
    }
    setSending(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        recipientEmail: trimmed,
        token: parseReportTokenFromPublicUrl(lastLink) || report.publicToken || undefined,
        cc: resolvedCcEmails,
        sendMeCopy,
        subject: replaceReportTags(subject, tagData),
        message: replaceReportTags(body, tagData),
        senderUid: senderUid || undefined,
      })
      const link = res.publicUrl || buildReportPublicUrl(res.token)
      setLastLink(link)
      setBody((prev) => applyReportLinkToText(prev, link))
      setSentTo(trimmed)
      showToast(
        res.sentCopyToSender ? `Report sent to ${trimmed} — copy sent to you` : `Report sent to ${trimmed}`,
        'success',
      )
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
    setSending(true)
    try {
      const link = await ensureReportLink()
      const msg = replaceReportTags(textBody, { ...tagData, ReportLink: link })
      window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`
      showToast('Opening SMS…', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to generate link', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      const link = await ensureReportLink()
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch (e) {
      showToast(e.message || 'Could not copy link', 'error')
    }
  }

  const busy = sending
  const linkBusy = generatingLink

  if (!report) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog send-report-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full md:max-w-2xl md:max-h-[90vh]"
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-report-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <DialogTitle>Report sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90">to: {sentTo}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-6 pb-4 space-y-3 flex-1 overflow-y-auto scrollbar-hide">
              {lastLink && (
                <p className="text-xs opacity-60 break-all">{lastLink}</p>
              )}
              <Button variant="outline" className="w-full min-h-[44px]" onClick={handleCopyLink} disabled={busy || linkBusy}>
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy report link
              </Button>
            </div>
            <DialogFooter className="px-6 pb-6 flex-shrink-0" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
              <Button className="w-full create-list-btn min-h-[44px]" onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-4 border-b border-white/10 flex-shrink-0 text-left"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <PanelHeader onBack={resetAndClose} title="Send photo report" icon={Mail} />
              <DialogDescription className="text-sm opacity-80 mt-1">
                {report.title || 'Photo Report'}
                {linkedLead ? ` — ${displayLeadName(linkedLead)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div
              className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 md:max-h-[calc(90vh-200px)]"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
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
                  <SendAsField
                    currentUser={currentUser}
                    teams={teams}
                    senderUid={senderUid}
                    onChangeSenderUid={setSenderUid}
                    disabled={busy}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-to">To</label>
                    <Input
                      id="report-send-to"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Recipient email"
                      className={TEXT_INPUT}
                    />
                  </div>

                  <OutreachCcField
                    teamMembers={teamMembers}
                    ccEmails={ccEmails}
                    onChangeCcEmails={setCcEmails}
                    excludeEmail={recipient}
                    disabled={busy}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-subject">Subject</label>
                    <input
                      id="report-send-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className={TEXT_INPUT}
                      placeholder="Email subject"
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-body">Message</label>
                    <textarea
                      id="report-send-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={10}
                      className={MESSAGE_TEXTAREA}
                      placeholder="Email message"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendMeCopy}
                      onChange={(e) => setSendMeCopy(e.target.checked)}
                      disabled={busy || !currentUser?.email}
                      className="h-4 w-4 accent-blue-600 cursor-pointer disabled:opacity-50"
                    />
                    Send me a copy
                  </label>
                </>
              ) : (
                <>
                  <SendAsField
                    currentUser={currentUser}
                    teams={teams}
                    senderUid={senderUid}
                    onChangeSenderUid={setSenderUid}
                    disabled={busy}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-phone">Phone</label>
                    <Input
                      id="report-send-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Client phone"
                      className={TEXT_INPUT}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-text">Message</label>
                    <textarea
                      id="report-send-text"
                      value={textBody}
                      onChange={(e) => setTextBody(e.target.value)}
                      rows={10}
                      className={MESSAGE_TEXTAREA}
                      placeholder="Text message"
                    />
                  </div>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={handleCopyLink}
                disabled={busy || linkBusy}
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy report link
              </Button>

              {tab === 'email' ? (
                <Button type="button" className="w-full min-h-[44px] create-list-btn" onClick={handleSendEmail} disabled={busy}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send email
                </Button>
              ) : (
                <Button type="button" className="w-full min-h-[44px] create-list-btn" onClick={handleSendText} disabled={busy || linkBusy}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Open SMS
                </Button>
              )}

              <Button type="button" variant="ghost" size="sm" onClick={handleSaveDefault} disabled={savingDefault || busy}>
                {savingDefault ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save as default template
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
