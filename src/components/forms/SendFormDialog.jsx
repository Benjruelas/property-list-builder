import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
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
import { PanelHeader } from '../ui/panel-header'
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
import { FORM_SEND_TAGS, replaceFormSendTags } from '@/utils/sendTemplateTags'
import { getSettings } from '@/utils/settings'
import { resolveLeadCustomFields } from '@/utils/customFields'
import { withLeadFieldTags, withLeadFieldTagData } from '@/utils/leadSendTags'
import { buildFormPrefillFromLead, mergeFormPrefill } from '@/utils/formLeadPrefill'
import { LeadPickerField } from '../pickers/LeadPickerField'
import { MessageTagEditor } from '../shared/MessageTagEditor'

const FormFillViewLazy = lazy(() => import('./FormFillView'))

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DEFAULT_LINK_SUBJECT = 'Please complete: {{formName}}'
const DEFAULT_PDF_SUBJECT = 'Form: {{formName}}'
const DEFAULT_LINK_NOTE = ''
const DEFAULT_TEXT_BODY = `Hi {{firstName}}, please complete this form: {{formLink}}`

const FIELD_LABEL = 'block text-sm font-medium text-white/75 mb-1'
const TEXT_INPUT = 'w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SUBJECT_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--single w-full min-h-[44px] px-3 py-2 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const MESSAGE_EDITOR = 'quote-msg-tag-editor w-full min-h-[8rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const TEXT_MESSAGE_EDITOR = 'quote-msg-tag-editor quote-msg-tag-editor--text w-full min-h-[5.5rem] p-3 border border-white/15 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
const SEGMENT_BTN =
  'send-form-btn flex-1 min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors'

function TagInsertStrip({ tags = FORM_SEND_TAGS, onInsert, disabled }) {
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
  leads = [],
  teams = [],
  teamMembership = null,
  /** Prefer this delivery when opening. */
  initialDelivery = 'link',
}) {
  const { getToken, currentUser } = useAuth()
  const [tab, setTab] = useState('email')
  const [delivery, setDelivery] = useState('link')
  const [selectedLead, setSelectedLead] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [lastLink, setLastLink] = useState('')
  const [sendMeCopy, setSendMeCopy] = useState(false)
  const [step, setStep] = useState('compose') // compose | preview
  const [previewValues, setPreviewValues] = useState({})
  /** Stable seed for FormFillView — only set the first time we enter preview. */
  const [previewSeed, setPreviewSeed] = useState({})
  const [previewMounted, setPreviewMounted] = useState(false)
  const subjectEditorRef = useRef(null)
  const emailEditorRef = useRef(null)
  const textEditorRef = useRef(null)
  const [focusedField, setFocusedField] = useState(null)
  const focusBlurTimerRef = useRef(null)
  const wasOpenRef = useRef(false)
  const canPdf = typeof preparePdf === 'function'

  const leadCustomFields = useMemo(
    () => resolveLeadCustomFields({ settings: getSettings(), teams, teamMembership }),
    [teams, teamMembership, open],
  )

  const sendTags = useMemo(
    () => withLeadFieldTags(FORM_SEND_TAGS, leadCustomFields),
    [leadCustomFields],
  )

  const pickerLeads = useMemo(() => {
    if (!lead?.id) return leads
    if (leads.some((l) => l.id === lead.id)) return leads
    return [lead, ...leads]
  }, [leads, lead])

  const leadEmails = useMemo(
    () => (selectedLead ? getLeadEmails(selectedLead) : []),
    [selectedLead],
  )
  const leadPhones = useMemo(
    () => (selectedLead ? getLeadPhones(selectedLead) : []),
    [selectedLead],
  )

  const prefillCount = useMemo(
    () => Object.keys(previewValues || prefillValues || {}).length,
    [previewValues, prefillValues],
  )

  const tagData = useMemo(() => withLeadFieldTagData({
    firstName: selectedLead?.firstName || '',
    lastName: selectedLead?.lastName || '',
    clientName: selectedLead
      ? displayLeadName(selectedLead) || ''
      : recipient.split('@')[0] || '',
    formName: template?.name || '',
    formLink: lastLink || '',
    senderName: getSenderDisplayName(currentUser),
    senderEmail: currentUser?.email || '',
    companyName: getCompanyNameForSends(teams, teamMembership),
  }, selectedLead, leadCustomFields), [selectedLead, recipient, template?.name, lastLink, currentUser, teams, teamMembership, leadCustomFields])

  const subtitle = useMemo(() => {
    const parts = [template?.name || 'Form']
    if (prefillCount > 0) {
      parts.push(`${prefillCount} field${prefillCount === 1 ? '' : 's'} prefilled`)
    }
    return parts.join(' · ')
  }, [template?.name, prefillCount])

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
    const field = focusedField
      || (tab === 'text' ? 'text' : 'body')
    if (field === 'subject') {
      subjectEditorRef.current?.focus?.()
      subjectEditorRef.current?.insertTag(key)
    } else if (field === 'text') {
      textEditorRef.current?.focus?.()
      textEditorRef.current?.insertTag(key)
    } else {
      emailEditorRef.current?.focus?.()
      emailEditorRef.current?.insertTag(key)
    }
  }

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    // Only reset when the dialog first opens — not when stepping back/forth or when
    // parent re-renders with a new lead object reference.
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setTab('email')
    setDelivery(canPdf && initialDelivery === 'pdf' ? 'pdf' : 'link')
    setSelectedLead(lead || null)
    setRecipient(lead ? (getLeadEmails(lead)[0] || '') : '')
    setPhone(lead ? (getLeadPhones(lead)[0] || '') : '')
    setSentTo(null)
    setLastLink('')
    setSendMeCopy(false)
    setFocusedField(null)
    setStep('compose')
    setPreviewValues({})
    setPreviewSeed({})
    setPreviewMounted(false)
    setSubject(canPdf && initialDelivery === 'pdf' ? DEFAULT_PDF_SUBJECT : DEFAULT_LINK_SUBJECT)
    setBody(DEFAULT_LINK_NOTE)
    setTextBody(DEFAULT_TEXT_BODY)
  }, [open, template?.name, initialDelivery, canPdf, lead])

  useEffect(() => {
    if (!open) return
    if (delivery === 'pdf') {
      setSubject((s) => {
        if (!s || s === DEFAULT_LINK_SUBJECT || s.startsWith('Please complete:')) return DEFAULT_PDF_SUBJECT
        return s
      })
    } else {
      setSubject((s) => {
        if (!s || s === DEFAULT_PDF_SUBJECT || s.startsWith('Form:')) return DEFAULT_LINK_SUBJECT
        return s
      })
    }
  }, [delivery, open])

  useEffect(() => {
    setFocusedField(null)
  }, [tab])

  const handleLeadChange = (nextLead) => {
    setSelectedLead(nextLead)
    setRecipient(nextLead ? (getLeadEmails(nextLead)[0] || '') : '')
    setPhone(nextLead ? (getLeadPhones(nextLead)[0] || '') : '')
  }

  const handleClose = () => {
    if (sending) return
    setSentTo(null)
    setStep('compose')
    setPreviewValues({})
    setPreviewSeed({})
    setPreviewMounted(false)
    wasOpenRef.current = false
    onClose?.()
  }

  const selectTab = (id) => {
    setTab(id)
    if (id === 'text' && delivery === 'pdf') {
      setDelivery('link')
    }
  }

  const selectDelivery = (id) => {
    if (id === 'pdf' && !canPdf) return
    if (id === 'pdf' && tab === 'text') {
      setTab('email')
    }
    setDelivery(id)
  }

  const leadMeta = selectedLead?.id ? {
    leadId: selectedLead.id,
    leadName: displayLeadName(selectedLead),
  } : {}

  const resolveTags = (text, extra = {}) => replaceFormSendTags(text, { ...tagData, ...extra })

  /** Keep {{formLink}} for the server to fill after the invite URL exists. */
  const resolveTagsForEmailInvite = (text) => resolveTags(text, { formLink: '{{formLink}}' })

  const handleContinueToPreview = () => {
    if (tab === 'email') {
      const trimmed = recipient.trim()
      if (!EMAIL_RE.test(trimmed)) {
        showToast('Enter a valid recipient email', 'error')
        return
      }
    } else {
      const tel = (phone || '').replace(/[^\d+]/g, '')
      if (tel.length < 10) {
        showToast('Enter a valid phone number', 'error')
        return
      }
      if (delivery === 'pdf') {
        showToast('PDF attachments can only be emailed. Switch to Link to complete for text.', 'error')
        return
      }
    }
    if (!template?.id) return
    if (!previewMounted) {
      const fromLead = buildFormPrefillFromLead(template.fields || [], selectedLead, leadCustomFields)
      const merged = mergeFormPrefill(fromLead, prefillValues || {})
      setPreviewSeed(merged)
      setPreviewValues(merged)
      setPreviewMounted(true)
    } else {
      // Re-enter preview with the latest edits captured while on that step.
      setPreviewSeed(previewValues)
    }
    setStep('preview')
  }

  const goBackToCompose = () => {
    setPreviewSeed(previewValues)
    setStep('compose')
  }

  const logSent = async (summary, meta = {}) => {
    if (!selectedLead?.id) return
    try {
      await logLeadFormSent(getToken, selectedLead.id, summary, {
        templateId: template?.id,
        templateName: template?.name,
        ...meta,
      })
      invalidateCachedLeadForms(selectedLead.id)
    } catch {
      /* non-blocking */
    }
  }

  const ensureInviteLink = async ({
    email,
    phone: phoneVal,
    skipEmail = false,
    fieldValues = null,
  } = {}) => {
    const filled = fieldValues && Object.keys(fieldValues).length > 0
      ? fieldValues
      : (Object.keys(previewValues || {}).length > 0 ? previewValues : (prefillValues || {}))
    const res = await createFormInvite(getToken, {
      templateId: template.id,
      recipientEmail: email || undefined,
      recipientPhone: phoneVal || undefined,
      subject: resolveTagsForEmailInvite(subject) || undefined,
      message: resolveTagsForEmailInvite(body) || undefined,
      prefillValues: Object.keys(filled || {}).length > 0 ? filled : undefined,
      skipEmail,
      ...leadMeta,
    })
    return res.formLink
  }

  const handleSendEmail = async (override = null) => {
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      showToast('Enter a valid recipient email', 'error')
      return
    }
    if (!template?.id) return
    const filled = override?.values || previewValues || prefillValues || {}
    const stripVals = override?.stripValues || values || filled
    setSending(true)
    try {
      const resolvedSubject = delivery === 'pdf'
        ? resolveTags(subject)
        : resolveTagsForEmailInvite(subject)
      const resolvedMessage = delivery === 'pdf'
        ? resolveTags(body)
        : resolveTagsForEmailInvite(body)
      if (delivery === 'pdf') {
        if (!canPdf && !override?.preparePdf) {
          showToast('PDF send is not available here', 'error')
          return
        }
        const pdfBase64 = override?.preparePdf
          ? await override.preparePdf()
          : await preparePdf()
        const payload = buildSendPayload({
          template,
          values: stripVals || {},
          recipient: trimmed,
          subject: resolvedSubject || `Form: ${template.name || 'Form'}`,
          message: resolvedMessage,
          flattenedPdfBase64: pdfBase64,
          sendMeCopy,
        })
        await sendForm(getToken, {
          ...payload,
          ...leadMeta,
          recipientPhone: (phone || '').replace(/\D/g, '').slice(-10) || undefined,
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
        subject: resolvedSubject || undefined,
        message: resolvedMessage || undefined,
        prefillValues: Object.keys(filled).length > 0 ? filled : undefined,
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

  const handleSendText = async (override = null) => {
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

    const filled = override?.values || previewValues || prefillValues || {}
    let link = lastLink
    const email = recipient.trim()
    if (!link) {
      setSending(true)
      try {
        link = await ensureInviteLink({
          phone: tel.slice(-10),
          email: EMAIL_RE.test(email) ? email : undefined,
          skipEmail: true,
          fieldValues: Object.keys(filled).length > 0 ? filled : undefined,
        })
        setLastLink(link)
      } catch (e) {
        showToast(e.message || 'Failed to generate link', 'error')
        setSending(false)
        return
      }
      setSending(false)
    }

    const msg = resolveTags(textBody, { formLink: link })
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

  const handleCopyLink = async (override = null) => {
    try {
      let link = lastLink
      if (!link) {
        const email = recipient.trim()
        const filled = override?.values || previewValues || prefillValues || {}
        link = await ensureInviteLink({
          email: EMAIL_RE.test(email) ? email : undefined,
          skipEmail: true,
          fieldValues: Object.keys(filled).length > 0 ? filled : undefined,
        })
        setLastLink(link)
      }
      await navigator.clipboard.writeText(link)
      showToast('Link copied', 'success')
    } catch (e) {
      showToast(e.message || 'Could not copy link', 'error')
    }
  }

  const handlePreviewConfirm = async (payload) => {
    if (tab === 'text') {
      await handleSendText(payload)
      return
    }
    await handleSendEmail(payload)
  }

  if (!template) return null

  const effectiveDelivery = tab === 'text' ? 'link' : delivery
  const confirmSendLabel = tab === 'text'
    ? 'Open SMS'
    : (effectiveDelivery === 'pdf' ? 'Send PDF' : 'Send email')

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className={`map-panel list-panel share-list-dialog forms-send-dialog send-form-dialog fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full ${step === 'preview' ? 'send-form-dialog--preview md:max-w-4xl' : 'md:max-w-2xl'}`}
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-form-dialog
        data-send-form-step={sentTo ? 'done' : step}
      >
        {sentTo ? (
          <>
            <DialogHeader
              className="px-6 pt-6 pb-3 flex-shrink-0"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex flex-col items-center text-center gap-3 pt-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden />
                <DialogTitle>Form sent</DialogTitle>
                <DialogDescription className="text-sm opacity-90 leading-relaxed">
                  to: {sentTo}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="px-6 pb-4 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              {lastLink ? (
                <Button variant="outline" className="send-form-btn w-full min-h-[44px]" onClick={() => handleCopyLink()} disabled={sending}>
                  <Copy className="h-4 w-4 mr-2" /> Copy link
                </Button>
              ) : null}
            </div>
            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <Button variant="outline" className="send-form-btn send-form-btn--primary w-full min-h-[44px]" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Keep compose mounted while previewing so subject/message editors are not remounted. */}
            <div
              className={step === 'compose' ? 'contents' : 'hidden'}
              aria-hidden={step !== 'compose'}
            >
            <DialogHeader
              className="px-6 pt-6 pb-3 border-b border-white/10 flex-shrink-0 text-left"
              style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <PanelHeader onBack={handleClose} title="Send form" icon={Mail} />
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
                    onClick={() => selectTab(id)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-white/50">Delivery</p>
                <div className="flex gap-2">
                  {[
                    { id: 'link', label: 'Link', icon: Link2, disabled: false },
                    {
                      id: 'pdf',
                      label: 'PDF',
                      icon: FileText,
                      disabled: !canPdf || tab === 'text',
                    },
                  ].map(({ id, label, icon: Icon, disabled }) => (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={effectiveDelivery === id}
                      className={SEGMENT_BTN}
                      onClick={() => selectDelivery(id)}
                      title={
                        !canPdf && id === 'pdf'
                          ? 'Open the form fill view to send a filled PDF'
                          : tab === 'text' && id === 'pdf'
                            ? 'PDF attachments can only be emailed'
                            : undefined
                      }
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  {effectiveDelivery === 'pdf'
                    ? 'Emails the current form as a PDF attachment.'
                    : 'One-time link to complete the form; you both get the PDF on submit.'}
                </p>
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
                    id="form-send-to"
                    label="To"
                    type="email"
                    value={recipient}
                    onChange={setRecipient}
                    options={leadEmails}
                    placeholder="Recipient email"
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="form-send-subject">Subject</label>
                    <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    <MessageTagEditor
                      ref={subjectEditorRef}
                      id="form-send-subject"
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
                    <label className={FIELD_LABEL} htmlFor="form-send-note">Message</label>
                    <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    <MessageTagEditor
                      ref={emailEditorRef}
                      id="form-send-note"
                      value={body}
                      onChange={setBody}
                      tagData={tagData}
                      tags={sendTags}
                      className={MESSAGE_EDITOR}
                      placeholder="Optional message — insert Form Link to include the URL"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('body')}
                      onBlur={handleEditorBlur}
                    />
                  </div>

                  {effectiveDelivery === 'pdf' ? (
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
                  ) : null}
                </>
              ) : (
                <>
                  <ContactField
                    id="form-send-phone"
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    options={leadPhones}
                    placeholder="Client phone"
                    disabled={sending}
                  />

                  <div>
                    <label className={FIELD_LABEL} htmlFor="form-send-text">Message</label>
                    <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={sending} />
                    <MessageTagEditor
                      ref={textEditorRef}
                      id="form-send-text"
                      value={textBody}
                      onChange={setTextBody}
                      tagData={tagData}
                      tags={sendTags}
                      className={TEXT_MESSAGE_EDITOR}
                      placeholder="Text message — include Form Link"
                      disabled={sending}
                      onFocus={() => handleEditorFocus('text')}
                      onBlur={handleEditorBlur}
                    />
                  </div>
                  <p className="text-xs text-white/50">
                    Opens your device SMS app with the completion link.
                  </p>
                </>
              )}
            </div>

            <DialogFooter
              className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <Button
                type="button"
                variant="outline"
                className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
                disabled={sending}
                onClick={handleContinueToPreview}
              >
                Continue
              </Button>
            </DialogFooter>
            </div>

            <div
              className={step === 'preview' ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}
              aria-hidden={step !== 'preview'}
            >
              <DialogHeader
                className="px-4 pt-4 pb-2 border-b border-white/10 flex-shrink-0 text-left"
                style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
              >
                <PanelHeader onBack={goBackToCompose} title="Preview form" icon={FileText} />
                <DialogDescription className="text-sm opacity-80 mt-1">
                  Review autofilled fields, then {confirmSendLabel.toLowerCase()}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {previewMounted ? (
                  <Suspense fallback={
                    <div className="flex h-full items-center justify-center text-sm opacity-70">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading preview…
                    </div>
                  }>
                    <FormFillViewLazy
                      template={template}
                      onBack={goBackToCompose}
                      initialValues={previewSeed}
                      onValuesChange={setPreviewValues}
                      lead={selectedLead}
                      leads={leads}
                      teams={teams}
                      teamMembership={teamMembership}
                      confirmMode
                      confirmLabel={confirmSendLabel}
                      onConfirmSend={handlePreviewConfirm}
                    />
                  </Suspense>
                ) : null}
              </div>
              {effectiveDelivery === 'link' && tab === 'email' ? (
                <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="send-form-btn w-full min-h-[44px]"
                    disabled={sending}
                    onClick={() => handleCopyLink({ values: previewValues })}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copy link without emailing
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SendFormDialog
