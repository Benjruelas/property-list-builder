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
  getReportSendTemplatesFromSettings,
  buildReportSendTemplatesPatch,
  REPORT_SEND_TAGS,
} from '../../utils/reportSendTemplates'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { getLeadEmails, getLeadPhones } from '@/utils/leadContact'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { getSenderDisplayName, getCompanyNameForSends } from '../../utils/profile'
import { updateSettings } from '../../utils/settings'
import { normalizeEmailAddress } from '@/utils/outreachAttachments'
import { getAllTeamMembers } from '@/utils/teamTaskUtils'
import { OutreachCcField } from '../outreach/OutreachCcField'
import { LeadPickerField } from '../pickers/LeadPickerField'
import { MessageTagEditor } from '../shared/MessageTagEditor'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SUBJECT_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--single w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const MESSAGE_EDITOR = 'quote-msg-tag-editor w-full min-h-[12rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const TEXT_MESSAGE_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--text w-full min-h-[5.5rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SEGMENT_BTN =
  'send-form-btn flex-1 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors'

function TagInsertStrip({ onInsert, disabled }) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {REPORT_SEND_TAGS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className="send-tag-chip text-[10px] px-1.5 py-0.5 rounded"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(key)}
          title={`Insert ${label}`}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ContactField({
  id,
  label,
  value,
  onChange,
  options = [],
  type = 'text',
  placeholder,
  disabled,
}) {
  if (options.length > 1) {
    const selectValue = options.includes(value) ? value : options[0]
    return (
      <div>
        <label className={FIELD_LABEL} htmlFor={id}>{label}</label>
        <select
          id={id}
          value={selectValue}
          onChange={(e) => onChange(e.target.value)}
          className={TEXT_INPUT}
          disabled={disabled}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {type === 'tel' ? formatPhoneDisplay(opt) || opt : opt}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div>
      <label className={FIELD_LABEL} htmlFor={id}>{label}</label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={TEXT_INPUT}
        disabled={disabled}
        autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined}
      />
    </div>
  )
}

export function SendReportDialog({ open, report, onClose, onSent, leads = [], teams = [], teamMembership = null }) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [selectedLead, setSelectedLead] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
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

  const linkedLead = useMemo(
    () => (report?.leadId ? leads.find((l) => l.id === report.leadId) : null),
    [report?.leadId, leads],
  )

  const pickerLeads = useMemo(() => {
    if (!linkedLead?.id) return leads
    if (leads.some((l) => l.id === linkedLead.id)) return leads
    return [linkedLead, ...leads]
  }, [leads, linkedLead])

  const leadEmails = useMemo(
    () => (selectedLead ? getLeadEmails(selectedLead) : []),
    [selectedLead],
  )
  const leadPhones = useMemo(
    () => (selectedLead ? getLeadPhones(selectedLead) : []),
    [selectedLead],
  )

  const senderName = useMemo(
    () => report?.createdByName || getSenderDisplayName(currentUser),
    [report?.createdByName, currentUser],
  )

  const tagData = useMemo(() => ({
    firstName: selectedLead?.firstName || '',
    lastName: selectedLead?.lastName || '',
    clientName: selectedLead ? displayLeadName(selectedLead) || '' : '',
    reportTitle: report?.title || '',
    reportLink: lastLink || '',
    senderName,
    companyName: getCompanyNameForSends(teams, teamMembership),
    leadAddress: selectedLead ? formatLeadAddress(selectedLead) : '',
  }), [report, selectedLead, senderName, teams, teamMembership, lastLink])

  const resolvedCcEmails = useMemo(() => {
    const seen = new Set()
    const to = normalizeEmailAddress(recipient)
    return (ccEmails || []).map(normalizeEmailAddress).filter((email) => {
      if (!email || email === to || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [ccEmails, recipient])

  const subjectEditorRef = useRef(null)
  const emailEditorRef = useRef(null)
  const textEditorRef = useRef(null)
  const [focusedField, setFocusedField] = useState(null)
  const focusBlurTimerRef = useRef(null)

  const handleEditorFocus = (field) => {
    if (focusBlurTimerRef.current) {
      clearTimeout(focusBlurTimerRef.current)
      focusBlurTimerRef.current = null
    }
    setFocusedField(field)
  }

  const handleEditorBlur = () => {
    if (focusBlurTimerRef.current) clearTimeout(focusBlurTimerRef.current)
    focusBlurTimerRef.current = setTimeout(() => {
      setFocusedField(null)
      focusBlurTimerRef.current = null
    }, 120)
  }

  const insertTag = (key) => {
    if (focusedField === 'subject') subjectEditorRef.current?.insertTag(key)
    else if (focusedField === 'text') textEditorRef.current?.insertTag(key)
    else emailEditorRef.current?.insertTag(key)
  }

  const mintReportLink = useCallback(async () => {
    setGeneratingLink(true)
    try {
      const res = await sendPhotoReportEmail(getToken, {
        reportId: report.id,
        generateOnly: true,
        token: parseReportTokenFromPublicUrl(lastLink) || report.publicToken || undefined,
      })
      const link = res.publicUrl || buildReportPublicUrl(res.token)
      setLastLink(link)
      return link
    } finally {
      setGeneratingLink(false)
    }
  }, [getToken, report?.id, report?.publicToken, lastLink])

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

    const initialLead = linkedLead || null
    setTab('email')
    setSelectedLead(initialLead)
    setRecipient(initialLead ? (getLeadEmails(initialLead)[0] || '') : '')
    setPhone(initialLead ? (getLeadPhones(initialLead)[0] || '') : '')
    setCcEmails([])
    setSendMeCopy(false)
    setSentTo(null)

    const existingLink = report.publicToken ? buildReportPublicUrl(report.publicToken) : ''
    setLastLink(existingLink)
    setFocusedField(null)

    const t = getReportSendTemplatesFromSettings()
    setSubject(t.emailSubject)
    setBody(t.emailBody)
    setTextBody(t.textBody)

    let cancelled = false

    const bootstrapLink = async () => {
      setGeneratingLink(true)
      try {
        const res = await sendPhotoReportEmail(getToken, {
          reportId: report.id,
          generateOnly: true,
          token: report.publicToken || parseReportTokenFromPublicUrl(existingLink) || undefined,
        })
        if (cancelled) return
        const link = res.publicUrl || buildReportPublicUrl(res.token)
        setLastLink(link)
      } catch (e) {
        if (!cancelled) showToast(e.message || 'Could not create report link', 'error')
      } finally {
        setGeneratingLink(false)
      }
    }

    bootstrapLink()
    return () => { cancelled = true }
  }, [open, report?.id, linkedLead?.id, getToken, report?.publicToken])

  useEffect(() => {
    setFocusedField(null)
  }, [tab])

  const handleLeadChange = (nextLead) => {
    setSelectedLead(nextLead)
    setRecipient(nextLead ? (getLeadEmails(nextLead)[0] || '') : '')
    setPhone(nextLead ? (getLeadPhones(nextLead)[0] || '') : '')
  }

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
      })
      const link = res.publicUrl || buildReportPublicUrl(res.token)
      setLastLink(link)
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
    if (tel.length < 10) {
      showToast('Enter a valid phone number', 'error')
      return
    }
    setSending(true)
    try {
      const link = await ensureReportLink()
      const msg = replaceReportTags(textBody, { ...tagData, reportLink: link })
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
        className="map-panel list-panel share-list-dialog send-report-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full md:max-w-2xl"
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
            <div className="px-6 pb-4 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <Button
                variant="outline"
                className="send-form-btn w-full min-h-[44px]"
                onClick={handleCopyLink}
                disabled={busy || linkBusy}
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
              className="px-6 pt-6 pb-3 border-b border-white/10 flex-shrink-0 text-left"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <PanelHeader onBack={resetAndClose} title="Send report" icon={Mail} />
              <DialogDescription className="text-sm opacity-80 mt-1">
                {report.title || 'Photo Report'}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-3 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <div className="flex gap-2">
                {[
                  { id: 'email', label: 'Email', icon: Mail },
                  { id: 'text', label: 'Text', icon: MessageSquare },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tab === id}
                    className={SEGMENT_BTN}
                    onClick={() => setTab(id)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <LeadPickerField
                label="Lead"
                leads={pickerLeads}
                value={selectedLead?.id || null}
                onChange={handleLeadChange}
              />

              {tab === 'email' ? (
                <>
                  <ContactField
                    id="report-send-to"
                    label="To"
                    type="email"
                    value={recipient}
                    onChange={setRecipient}
                    options={leadEmails}
                    placeholder="Recipient email"
                    disabled={busy}
                  />

                  <OutreachCcField
                    teamMembers={teamMembers}
                    ccEmails={ccEmails}
                    onChangeCcEmails={setCcEmails}
                    excludeEmail={recipient}
                    disabled={busy}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-subject">Subject</label>
                    {focusedField === 'subject' && (
                      <TagInsertStrip onInsert={insertTag} disabled={busy} />
                    )}
                    <MessageTagEditor
                      ref={subjectEditorRef}
                      id="report-send-subject"
                      value={subject}
                      onChange={setSubject}
                      tagData={tagData}
                      tags={REPORT_SEND_TAGS}
                      className={SUBJECT_EDITOR}
                      placeholder="Email subject"
                      disabled={busy}
                      singleLine
                      onFocus={() => handleEditorFocus('subject')}
                      onBlur={handleEditorBlur}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-body">Message</label>
                    {focusedField === 'body' && (
                      <TagInsertStrip onInsert={insertTag} disabled={busy} />
                    )}
                    <MessageTagEditor
                      ref={emailEditorRef}
                      id="report-send-body"
                      value={body}
                      onChange={setBody}
                      tagData={tagData}
                      tags={REPORT_SEND_TAGS}
                      className={MESSAGE_EDITOR}
                      placeholder="Optional message"
                      disabled={busy}
                      onFocus={() => handleEditorFocus('body')}
                      onBlur={handleEditorBlur}
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
                  <ContactField
                    id="report-send-phone"
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    options={leadPhones}
                    placeholder="Client phone"
                    disabled={busy}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="report-send-text">Message</label>
                    {focusedField === 'text' && (
                      <TagInsertStrip onInsert={insertTag} disabled={busy} />
                    )}
                    <MessageTagEditor
                      ref={textEditorRef}
                      id="report-send-text"
                      value={textBody}
                      onChange={setTextBody}
                      tagData={tagData}
                      tags={REPORT_SEND_TAGS}
                      className={TEXT_MESSAGE_EDITOR}
                      placeholder="Text message"
                      disabled={busy}
                      onFocus={() => handleEditorFocus('text')}
                      onBlur={handleEditorBlur}
                    />
                  </div>
                  <p className="text-xs text-white/50">
                    Opens your device SMS app with the report link.
                  </p>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                className="send-form-btn w-full min-h-[44px]"
                onClick={handleCopyLink}
                disabled={busy || linkBusy}
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy link
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full opacity-70"
                onClick={handleSaveDefault}
                disabled={savingDefault || busy}
              >
                {savingDefault ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save as default template
              </Button>
            </div>

            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {tab === 'email' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                  onClick={handleSendEmail}
                  disabled={busy}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send email
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                  onClick={handleSendText}
                  disabled={busy || linkBusy}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Open SMS
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
