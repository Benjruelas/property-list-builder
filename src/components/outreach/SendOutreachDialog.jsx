import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Mail, MessageSquare, Paperclip, X } from 'lucide-react'
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
import { showConfirm } from '../ui/confirm-dialog'
import {
  OUTREACH_SEND_TAGS,
  braceTagsToMustache,
  buildOutreachTagData,
  resolveOutreachTemplateText,
} from '../../utils/emailTemplates'
import { getSettings } from '../../utils/settings'
import { sendOutreachEmail } from '../../utils/outreachEmail'
import {
  readFilesAsAttachments,
  validateAttachmentTotalSize,
  normalizeEmailAddress,
} from '../../utils/outreachAttachments'
import { formatStorageBytes, MAX_SINGLE_UPLOAD_BYTES } from '../../utils/uploadLimits'
import { formatPhoneDisplay, normalizePhoneForTel, parsePhoneDigits } from '../../utils/phoneFormat'
import { getLeadPhones, getLeadEmails } from '../../utils/leadContact'
import { findLeadById } from '../../utils/leads'
import { getSkipTracedParcel } from '../../utils/skipTrace'
import { MessageTagEditor } from '../shared/MessageTagEditor'
import { InlineDropdown } from '../InlineDropdown'
import { OutreachCcField } from './OutreachCcField'
import { resolveLeadCustomFields } from '../../utils/customFields'
import { withLeadFieldTags, withLeadFieldTagData } from '../../utils/leadSendTags'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SUBJECT_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--single w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const MESSAGE_EDITOR = 'quote-msg-tag-editor w-full min-h-[10rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const TEXT_MESSAGE_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--text w-full min-h-[5.5rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SEGMENT_BTN =
  'send-form-btn flex-1 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors'

function TagInsertStrip({ tags = OUTREACH_SEND_TAGS, onInsert, disabled }) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {tags.map(({ key, label }) => (
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
    const dropdownOptions = options.map((opt) => ({
      id: opt,
      label: type === 'tel' ? (formatPhoneDisplay(opt) || opt) : opt,
    }))
    return (
      <div>
        <label className={FIELD_LABEL} htmlFor={id}>{label}</label>
        <InlineDropdown
          value={selectValue}
          onChange={onChange}
          options={dropdownOptions}
          placeholder={placeholder}
          showLabel={false}
          disabled={disabled}
          triggerClassName="rounded-lg"
        />
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

function mergeUniquePhones(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const raw of list || []) {
      const v = String(raw || '').trim()
      if (!v) continue
      const key = parsePhoneDigits(v)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(v)
    }
  }
  return out
}

function mergeUniqueEmails(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const raw of list || []) {
      const v = String(raw || '').trim()
      if (!v) continue
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(v)
    }
  }
  return out
}

function phonesFromSkipTrace(parcelData) {
  const st = getSkipTracedParcel(parcelData)
  if (!st) return []
  if (Array.isArray(st.phoneDetails) && st.phoneDetails.length) {
    return st.phoneDetails.map((d) => d?.value).filter(Boolean)
  }
  if (Array.isArray(st.phoneNumbers) && st.phoneNumbers.length) return st.phoneNumbers.filter(Boolean)
  return st.phone ? [st.phone] : []
}

function emailsFromSkipTrace(parcelData) {
  const st = getSkipTracedParcel(parcelData)
  if (!st) return []
  if (Array.isArray(st.emailDetails) && st.emailDetails.length) {
    return st.emailDetails.map((d) => d?.value).filter(Boolean)
  }
  if (Array.isArray(st.emails) && st.emails.length) return st.emails.filter(Boolean)
  return st.email ? [st.email] : []
}

/**
 * Fullscreen outreach compose — matches Form/Quote/Report send shell.
 */
export function SendOutreachDialog({
  open,
  onClose,
  template = null,
  parcelData = null,
  recipientEmail = '',
  recipientPhone = '',
  recipientName = '',
  leadId = null,
  lead = null,
  leads = [],
  initialTab = 'email',
  onOutreach,
  getToken,
  currentUser,
  teamMembers = [],
  teams = [],
  teamMembership = null,
  leadCustomFields: leadCustomFieldsProp = null,
  emailTestMode = false,
  testEmail = '',
}) {
  const [tab, setTab] = useState(initialTab === 'text' ? 'text' : 'email')
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [sendMeCopy, setSendMeCopy] = useState(false)
  const [ccEmails, setCcEmails] = useState([])
  const [attachments, setAttachments] = useState([])
  const [focusedField, setFocusedField] = useState(null)
  const fileInputRef = useRef(null)
  const subjectEditorRef = useRef(null)
  const emailEditorRef = useRef(null)
  const textEditorRef = useRef(null)
  const focusBlurTimerRef = useRef(null)

  const resolvedLead = useMemo(() => {
    if (lead?.id) return lead
    if (parcelData?.lead?.id) return parcelData.lead
    if (leadId) return findLeadById(leads, leadId)
    return null
  }, [lead, parcelData?.lead, leadId, leads])

  const leadCustomFields = useMemo(() => {
    if (Array.isArray(leadCustomFieldsProp)) return leadCustomFieldsProp
    return resolveLeadCustomFields({
      settings: getSettings(),
      teams,
      teamMembership,
    })
  }, [leadCustomFieldsProp, teams, teamMembership, open])

  const sendTags = useMemo(
    () => withLeadFieldTags(OUTREACH_SEND_TAGS, leadCustomFields),
    [leadCustomFields],
  )

  const leadPhones = useMemo(() => mergeUniquePhones(
    recipientPhone ? [recipientPhone] : [],
    resolvedLead ? getLeadPhones(resolvedLead) : [],
    phonesFromSkipTrace(parcelData),
    parcelData?.phone ? [parcelData.phone] : [],
  ), [recipientPhone, resolvedLead, parcelData])

  const leadEmails = useMemo(() => mergeUniqueEmails(
    recipientEmail ? [recipientEmail] : [],
    resolvedLead ? getLeadEmails(resolvedLead) : [],
    emailsFromSkipTrace(parcelData),
    parcelData?.email ? [parcelData.email] : [],
  ), [recipientEmail, resolvedLead, parcelData])

  const actualRecipientEmail = (emailTestMode && testEmail) ? testEmail : recipient

  const tagParcelData = useMemo(() => {
    if (!parcelData && !resolvedLead) return null
    return {
      ...(parcelData || {}),
      lead: resolvedLead || parcelData?.lead || null,
      firstName: parcelData?.firstName || resolvedLead?.firstName || '',
      lastName: parcelData?.lastName || resolvedLead?.lastName || '',
      ownerName: parcelData?.ownerName || resolvedLead?.owner || '',
      address: parcelData?.address || resolvedLead?.address || '',
    }
  }, [parcelData, resolvedLead])

  const tagData = useMemo(
    () => withLeadFieldTagData(buildOutreachTagData(tagParcelData), resolvedLead, leadCustomFields),
    [tagParcelData, resolvedLead, leadCustomFields],
  )

  const subtitle = useMemo(() => {
    const parts = []
    const name = recipientName
      || [resolvedLead?.firstName, resolvedLead?.lastName].filter(Boolean).join(' ')
    if (name) parts.push(name)
    const addr = parcelData?.address
      || parcelData?.properties?.SITUS_ADDR
      || parcelData?.properties?.SITE_ADDR
      || resolvedLead?.address
    if (addr) parts.push(addr)
    if (template?.name) parts.push(template.name)
    return parts.join(' · ') || 'Compose message'
  }, [recipientName, parcelData, template?.name, resolvedLead])

  const attachmentBytes = useMemo(
    () => attachments.reduce((sum, f) => sum + (Number(f.size) || 0), 0),
    [attachments],
  )

  const resolvedCcEmails = useMemo(() => {
    const seen = new Set()
    const to = normalizeEmailAddress(actualRecipientEmail)
    return (ccEmails || []).map(normalizeEmailAddress).filter((email) => {
      if (!email || email === to || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [ccEmails, actualRecipientEmail])

  useEffect(() => {
    if (!open) return
    setTab(initialTab === 'text' ? 'text' : 'email')
    setRecipient(recipientEmail || '')
    setPhone(recipientPhone || '')
    setSendMeCopy(false)
    setCcEmails([])
    setAttachments([])
    setSentTo(null)
    setFocusedField(null)
    const subj = braceTagsToMustache(template?.subject || '')
    const msg = braceTagsToMustache(template?.body || '')
    setSubject(subj)
    setBody(msg)
    setTextBody(msg)
  }, [open, template, parcelData, recipientEmail, recipientPhone, initialTab])

  useEffect(() => {
    setFocusedField(null)
  }, [tab])

  // Autofill To / Phone from lead + skip-trace once contacts are known (and on Text tab).
  useEffect(() => {
    if (!open) return
    setRecipient((prev) => {
      if (prev.trim()) {
        if (leadEmails.length > 1 && !leadEmails.includes(prev)) return leadEmails[0]
        return prev
      }
      return leadEmails[0] || prev
    })
    setPhone((prev) => {
      if (prev.trim()) {
        if (leadPhones.length > 1 && !leadPhones.includes(prev)) return leadPhones[0]
        return prev
      }
      return leadPhones[0] || prev
    })
  }, [open, leadEmails, leadPhones, tab])

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

  const handleClose = () => {
    if (sending) return
    setSentTo(null)
    onClose?.()
  }

  const handleAttachmentPick = (e) => {
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

  const handleSendEmail = async () => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed) && !(emailTestMode && testEmail)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    if (!subject.trim() && !body.trim()) {
      showToast('Email subject and body cannot both be empty', 'error')
      return
    }

    const resolvedSubject = resolveOutreachTemplateText(subject, tagParcelData, leadCustomFields)
    const resolvedBody = resolveOutreachTemplateText(body, tagParcelData, leadCustomFields)
    const toAddr = actualRecipientEmail || trimmed

    const ccSummary = resolvedCcEmails.length ? `\nCC: ${resolvedCcEmails.join(', ')}` : ''
    const confirmed = await showConfirm(
      `Send email to ${toAddr}${toAddr !== trimmed ? ` (testing - original: ${trimmed})` : ''}?${ccSummary}`,
      'Confirm Send',
    )
    if (!confirmed) return

    setSending(true)
    try {
      const s = getSettings()
      const finalBody = s.emailSignatureEnabled && s.emailSignature
        ? `${resolvedBody}\n\n${s.emailSignature}`
        : resolvedBody

      const attachmentPayload = attachments.length
        ? await readFilesAsAttachments(attachments.map((a) => a.file))
        : []

      await sendOutreachEmail(getToken, {
        recipientEmail: toAddr,
        cc: resolvedCcEmails,
        subject: resolvedSubject,
        message: finalBody,
        sendMeCopy,
        attachments: attachmentPayload,
        leadId: leadId || undefined,
      })

      if (leadId && onOutreach) onOutreach('email', toAddr)
      showToast(sendMeCopy ? 'Email sent — copy sent to you' : 'Email sent', 'success')
      setSentTo(toAddr)
    } catch (error) {
      console.error('Error sending email:', error)
      showToast(error.message || 'Failed to send email', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSendText = () => {
    const tel = normalizePhoneForTel(phone)
    if (!tel || String(tel).replace(/\D/g, '').length < 10) {
      showToast('Enter a valid phone number', 'error')
      return
    }
    const msg = resolveOutreachTemplateText(textBody, tagParcelData, leadCustomFields)
    const url = msg
      ? `sms:${tel}?body=${encodeURIComponent(msg)}`
      : `sms:${tel}`
    if (leadId && onOutreach) onOutreach('text', phone || tel)
    window.location.href = url
    showToast('Opening SMS…', 'success')
    setSentTo(formatPhoneDisplay(tel) || tel)
  }

  if (!open || !parcelData) return null

  const headerTitle = tab === 'text' ? 'Send text' : 'Send email'

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog send-outreach-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full md:max-w-2xl"
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-outreach-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>{tab === 'text' ? 'SMS opened' : 'Email sent'}</DialogTitle>
                <DialogDescription className="text-sm opacity-90 leading-relaxed">
                  to: {sentTo}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-6 pb-4 flex-1 min-h-0" />
            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <Button
                variant="outline"
                className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                onClick={handleClose}
              >
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
              <PanelHeader onBack={handleClose} title={headerTitle} icon={Mail} />
              <DialogDescription className="text-sm opacity-80 mt-1">
                {subtitle}
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

              {tab === 'email' ? (
                <>
                  {emailTestMode && testEmail ? (
                    <div>
                      <label className={FIELD_LABEL} htmlFor="outreach-send-to">To</label>
                      <div
                        id="outreach-send-to"
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 min-h-[44px] flex items-center"
                      >
                        {testEmail}
                        <span className="text-amber-300 ml-2 text-xs">
                          (Testing{recipient ? ` — original: ${recipient}` : ''})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ContactField
                      id="outreach-send-to"
                      label="To"
                      type="email"
                      value={recipient}
                      onChange={setRecipient}
                      options={leadEmails}
                      placeholder="Recipient email"
                      disabled={sending}
                    />
                  )}

                  <OutreachCcField
                    teamMembers={teamMembers}
                    ccEmails={ccEmails}
                    onChangeCcEmails={setCcEmails}
                    excludeEmail={actualRecipientEmail}
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="outreach-send-subject">Subject</label>
                    {focusedField === 'subject' && (
                      <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    )}
                    <MessageTagEditor
                      ref={subjectEditorRef}
                      id="outreach-send-subject"
                      value={subject}
                      onChange={setSubject}
                      tagData={tagData}
                      tags={sendTags}
                      className={SUBJECT_EDITOR}
                      placeholder="Email subject"
                      disabled={sending}
                      singleLine
                      onFocus={() => handleEditorFocus('subject')}
                      onBlur={handleEditorBlur}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL} htmlFor="outreach-send-body">Message</label>
                    {focusedField === 'body' && (
                      <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    )}
                    <MessageTagEditor
                      ref={emailEditorRef}
                      id="outreach-send-body"
                      value={body}
                      onChange={setBody}
                      tagData={tagData}
                      tags={sendTags}
                      className={MESSAGE_EDITOR}
                      placeholder="Email message"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('body')}
                      onBlur={handleEditorBlur}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-white/75">
                        Attachments
                      </label>
                      <span className="text-xs text-white/50">
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
                      className="send-form-btn w-full min-h-[44px] justify-start"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending || attachmentBytes >= MAX_SINGLE_UPLOAD_BYTES}
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Add files
                    </Button>
                    {attachments.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {attachments.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                          >
                            <span className="truncate">{item.name}</span>
                            <span className="shrink-0 text-xs text-white/50">
                              {formatStorageBytes(item.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(item.id)}
                              disabled={sending}
                              className="shrink-0 rounded p-1 hover:bg-white/10 disabled:opacity-50"
                              aria-label={`Remove ${item.name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendMeCopy}
                      onChange={(e) => setSendMeCopy(e.target.checked)}
                      disabled={sending || !currentUser?.email}
                      className="h-4 w-4 accent-blue-600 cursor-pointer disabled:opacity-50"
                    />
                    Send me a copy
                  </label>
                </>
              ) : (
                <>
                  <ContactField
                    id="outreach-send-phone"
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    options={leadPhones}
                    placeholder="Client phone"
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="outreach-send-text">Message</label>
                    {focusedField === 'text' && (
                      <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    )}
                    <MessageTagEditor
                      ref={textEditorRef}
                      id="outreach-send-text"
                      value={textBody}
                      onChange={setTextBody}
                      tagData={tagData}
                      tags={sendTags}
                      className={TEXT_MESSAGE_EDITOR}
                      placeholder="Text message"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('text')}
                      onBlur={handleEditorBlur}
                    />
                  </div>
                  <p className="text-xs text-white/50">
                    Opens your device SMS app with this message.
                  </p>
                </>
              )}
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
                  disabled={sending}
                  onClick={handleSendEmail}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  {sending ? 'Sending…' : 'Send email'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                  disabled={sending}
                  onClick={handleSendText}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
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

export default SendOutreachDialog
