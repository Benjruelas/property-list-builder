import { useState, useEffect, useMemo, useRef } from 'react'
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
import { PanelHeader } from '../ui/panel-header'
import { showToast } from '../ui/toast'
import { useAuth } from '../../contexts/AuthContext'
import { sendQuoteEmail } from '../../utils/quotes'
import {
  QUOTE_SEND_TAGS,
  replaceQuoteTags,
  getQuoteSendTemplatesFromSettings,
  buildQuoteSendTemplatesPatch,
} from '../../utils/quoteSendTemplates'
import { formatQuoteMoney } from '../../utils/quoteMath'
import { getSettings, updateSettings } from '../../utils/settings'
import { getSenderDisplayName, getCompanyNameForSends } from '../../utils/profile'
import { findLeadById, displayLeadName } from '@/utils/leads'
import { getLeadEmails, getLeadPhones } from '@/utils/leadContact'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { LeadPickerField } from '../pickers/LeadPickerField'
import { QuoteMessageTagEditor } from './QuoteMessageTagEditor'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SUBJECT_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--single w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const MESSAGE_EDITOR = 'quote-msg-tag-editor w-full min-h-[14rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const TEXT_MESSAGE_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--text w-full min-h-[5.5rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SEGMENT_BTN =
  'send-form-btn flex-1 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors'

function TagInsertStrip({ onInsert, disabled }) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {QUOTE_SEND_TAGS.map(({ key, label }) => (
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

export function SendQuoteDialog({ open, quote, onClose, onSent, leads = [], teams = [], teamMembership = null }) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [selectedLead, setSelectedLead] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [lastLink, setLastLink] = useState('')
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

  const linkedLead = useMemo(
    () => findLeadById(leads, quote?.leadId),
    [quote?.leadId, leads],
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

  const tagData = useMemo(() => ({
    firstName: selectedLead?.firstName || '',
    lastName: selectedLead?.lastName || '',
    clientName: selectedLead
      ? displayLeadName(selectedLead) || ''
      : quote?.clientName || recipient.split('@')[0] || '',
    quoteTitle: quote?.title || '',
    quoteTotal: quote?.total,
    quoteLink: lastLink || '',
    senderName: getSenderDisplayName(currentUser),
    senderEmail: currentUser?.email || '',
    validUntil: quote?.validUntil?.slice(0, 10) || '',
    companyName: getCompanyNameForSends(teams, teamMembership),
  }), [quote, selectedLead, recipient, lastLink, currentUser, teams, teamMembership])

  const subtitle = useMemo(() => {
    const title = quote?.title || 'Quote'
    const total = formatQuoteMoney(quote?.total)
    return total ? `${title} — ${total}` : title
  }, [quote?.title, quote?.total])

  useEffect(() => {
    if (!open || !quote?.id) return
    const initialLead = linkedLead || null
    setTab('email')
    setSelectedLead(initialLead)
    setRecipient(
      initialLead
        ? (getLeadEmails(initialLead)[0] || quote?.clientEmail || '')
        : (quote?.clientEmail || ''),
    )
    setPhone(
      initialLead
        ? (getLeadPhones(initialLead)[0] || quote?.clientPhone || '')
        : (quote?.clientPhone || ''),
    )
    setSentTo(null)
    setLastLink('')
    setFocusedField(null)
    const templates = getQuoteSendTemplatesFromSettings(getSettings())
    setSubject(templates.email.subject)
    setBody(templates.email.body)
    setTextBody(templates.text.body)
  }, [open, quote?.id, quote?.clientEmail, quote?.clientPhone, linkedLead])

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

  const ensureQuoteLink = async () => {
    if (lastLink) return lastLink
    const email = recipient.trim() || quote?.clientEmail || ''
    if (!EMAIL_RE.test(email)) {
      throw new Error('Enter a recipient email to generate a link')
    }
    const res = await sendQuoteEmail(getToken, {
      quoteId: quote.id,
      recipientEmail: email,
      generateOnly: true,
      recipientPhone: (phone || '').replace(/\D/g, '').slice(-10) || undefined,
    })
    const link = res.quoteLink || ''
    setLastLink(link)
    return link
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
        subject: replaceQuoteTags(subject, {
          ...tagData,
          clientName: selectedLead
            ? displayLeadName(selectedLead) || trimmed.split('@')[0]
            : quote.clientName || trimmed.split('@')[0],
        }),
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
    if (tel.length < 10) {
      showToast('Enter a valid phone number', 'error')
      return
    }
    setSending(true)
    try {
      const link = await ensureQuoteLink()
      const msg = replaceQuoteTags(textBody, { ...tagData, quoteLink: link })
      window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`
      showToast('Opening SMS…', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to generate link', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleCopyLink = async () => {
    setSending(true)
    try {
      const link = await ensureQuoteLink()
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch (e) {
      showToast(e.message || 'Could not copy link', 'error')
    } finally {
      setSending(false)
    }
  }

  const insertTag = (key) => {
    if (focusedField === 'subject') subjectEditorRef.current?.insertTag(key)
    else if (focusedField === 'text') textEditorRef.current?.insertTag(key)
    else emailEditorRef.current?.insertTag(key)
  }

  if (!quote) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent
        className="map-panel list-panel share-list-dialog send-quote-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full md:max-w-2xl"
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-quote-dialog
      >
        {sentTo ? (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>Quote sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90">to: {sentTo}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-6 pb-4 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              {lastLink ? (
                <Button
                  variant="outline"
                  className="send-form-btn w-full min-h-[44px]"
                  onClick={handleCopyLink}
                  disabled={sending}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy link
                </Button>
              ) : null}
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
              <PanelHeader onBack={resetAndClose} title="Send quote" icon={Mail} />
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

              <LeadPickerField
                label="Lead"
                leads={pickerLeads}
                value={selectedLead?.id || null}
                onChange={handleLeadChange}
              />

              {tab === 'email' ? (
                <>
                  <ContactField
                    id="quote-send-to"
                    label="To"
                    type="email"
                    value={recipient}
                    onChange={setRecipient}
                    options={leadEmails}
                    placeholder="Recipient email"
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="quote-send-subject">Subject</label>
                    {focusedField === 'subject' && (
                      <TagInsertStrip onInsert={insertTag} disabled={sending} />
                    )}
                    <QuoteMessageTagEditor
                      ref={subjectEditorRef}
                      id="quote-send-subject"
                      value={subject}
                      onChange={setSubject}
                      tagData={tagData}
                      className={SUBJECT_EDITOR}
                      placeholder="Email subject"
                      disabled={sending}
                      singleLine
                      onFocus={() => handleEditorFocus('subject')}
                      onBlur={handleEditorBlur}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL} htmlFor="quote-send-body">Message</label>
                    {focusedField === 'body' && (
                      <TagInsertStrip onInsert={insertTag} disabled={sending} />
                    )}
                    <QuoteMessageTagEditor
                      ref={emailEditorRef}
                      id="quote-send-body"
                      value={body}
                      onChange={setBody}
                      tagData={tagData}
                      className={MESSAGE_EDITOR}
                      placeholder="Optional message"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('body')}
                      onBlur={handleEditorBlur}
                    />
                  </div>
                </>
              ) : (
                <>
                  <ContactField
                    id="quote-send-phone"
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    options={leadPhones}
                    placeholder="Client phone"
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="quote-send-text">Message</label>
                    {focusedField === 'text' && (
                      <TagInsertStrip onInsert={insertTag} disabled={sending} />
                    )}
                    <QuoteMessageTagEditor
                      ref={textEditorRef}
                      id="quote-send-text"
                      value={textBody}
                      onChange={setTextBody}
                      tagData={tagData}
                      className={TEXT_MESSAGE_EDITOR}
                      placeholder="Text message"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('text')}
                      onBlur={handleEditorBlur}
                    />
                  </div>
                  <p className="text-xs text-white/50">
                    Opens your device SMS app with the quote link.
                  </p>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                className="send-form-btn w-full min-h-[44px]"
                disabled={sending}
                onClick={handleCopyLink}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy link
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full opacity-70"
                disabled={savingDefault || sending}
                onClick={handleSaveDefaults}
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
                  disabled={sending}
                  onClick={handleSendEmail}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send email
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                  disabled={sending}
                  onClick={handleSendText}
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
