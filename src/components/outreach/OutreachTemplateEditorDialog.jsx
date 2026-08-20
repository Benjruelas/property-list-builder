import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
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
import { MessageTagEditor } from '../shared/MessageTagEditor'
import { showToast } from '../ui/toast'
import {
  OUTREACH_SEND_TAGS,
  braceTagsToMustache,
  mustacheToBraceTags,
  buildOutreachTagData,
} from '@/utils/emailTemplates'
import {
  createOutreachTemplate,
  updateOutreachTemplateApi,
} from '@/utils/outreachTemplates'
import { withLeadFieldTags, withLeadFieldTagData } from '@/utils/leadSendTags'
import {
  OUTREACH_TEMPLATE_PANEL_CLASS,
  OUTREACH_TEMPLATE_FIELD_LABEL,
  OUTREACH_TEMPLATE_TEXT_INPUT,
  OUTREACH_TEMPLATE_SUBJECT_EDITOR,
  OUTREACH_TEMPLATE_MESSAGE_EDITOR,
  OUTREACH_TEMPLATE_TEXT_MESSAGE_EDITOR,
} from './outreachTemplatePanelShared'

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

export function OutreachTemplateEditorDialog({
  open,
  onOpenChange,
  kind = 'email',
  template = null,
  getToken = null,
  onSaved,
  leadCustomFields = [],
}) {
  const isEdit = !!template?.id
  const initializedRef = useRef(false)
  const focusBlurTimerRef = useRef(null)
  const subjectEditorRef = useRef(null)
  const bodyEditorRef = useRef(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const [saving, setSaving] = useState(false)

  const sendTags = useMemo(
    () => withLeadFieldTags(OUTREACH_SEND_TAGS, leadCustomFields),
    [leadCustomFields],
  )
  const tagData = useMemo(
    () => withLeadFieldTagData(buildOutreachTagData(null), null, leadCustomFields),
    [leadCustomFields],
  )

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      if (focusBlurTimerRef.current) {
        clearTimeout(focusBlurTimerRef.current)
        focusBlurTimerRef.current = null
      }
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    setName(template?.name || '')
    setSubject(braceTagsToMustache(template?.subject ?? ''))
    setBody(braceTagsToMustache(template?.body ?? ''))
    setFocusedField(null)
  }, [open, template])

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
    if (kind === 'email' && focusedField === 'subject') subjectEditorRef.current?.insertTag(key)
    else bodyEditorRef.current?.insertTag(key)
  }

  const hasChanges = isEdit
    ? name.trim() !== (template.name || '').trim()
      || mustacheToBraceTags(subject) !== (template.subject ?? '')
      || mustacheToBraceTags(body) !== (template.body ?? '')
    : true

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Enter a template name', 'error')
      return
    }
    if (!getToken) {
      showToast('Sign in to save templates', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        channel: kind === 'text' ? 'text' : 'email',
        name: name.trim(),
        body: mustacheToBraceTags(body),
        ...(kind === 'email' ? { subject: mustacheToBraceTags(subject) } : {}),
      }
      if (isEdit) {
        await updateOutreachTemplateApi(getToken, template.id, payload)
        showToast('Template updated', 'success')
      } else {
        await createOutreachTemplate(getToken, payload)
        showToast('Template created', 'success')
      }
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      showToast(e.message || 'Could not save template', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    onOpenChange(false)
  }

  if (!open) return null

  const title = isEdit ? 'Edit template' : 'New template'
  const subtitle = kind === 'email' ? 'Email outreach template' : 'Text message template'

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className={OUTREACH_TEMPLATE_PANEL_CLASS}
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-send-outreach-dialog
      >
        <DialogHeader
          className="px-6 pt-6 pb-3 border-b border-white/10 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader onBack={handleClose} title={title} icon={FileText} />
          <DialogDescription className="text-sm opacity-80 mt-1">
            {subtitle}
          </DialogDescription>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <div>
            <label className={OUTREACH_TEMPLATE_FIELD_LABEL} htmlFor="outreach-template-name">
              Name
            </label>
            <Input
              id="outreach-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'email' ? 'e.g. Initial contact' : 'e.g. Follow-up text'}
              className={OUTREACH_TEMPLATE_TEXT_INPUT}
              autoFocus
              disabled={saving}
            />
          </div>

          {kind === 'email' && (
            <div>
              <label className={OUTREACH_TEMPLATE_FIELD_LABEL} htmlFor="outreach-template-subject">
                Subject
              </label>
              {focusedField === 'subject' && (
                <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={saving} />
              )}
              <MessageTagEditor
                ref={subjectEditorRef}
                id="outreach-template-subject"
                value={subject}
                onChange={setSubject}
                tagData={tagData}
                tags={sendTags}
                className={OUTREACH_TEMPLATE_SUBJECT_EDITOR}
                placeholder="Email subject line"
                disabled={saving}
                singleLine
                onFocus={() => handleEditorFocus('subject')}
                onBlur={handleEditorBlur}
              />
            </div>
          )}

          <div>
            <label className={OUTREACH_TEMPLATE_FIELD_LABEL} htmlFor="outreach-template-body">
              {kind === 'email' ? 'Body' : 'Message'}
            </label>
            {focusedField === 'body' && (
              <TagInsertStrip tags={sendTags} onInsert={insertTag} disabled={saving} />
            )}
            <MessageTagEditor
              ref={bodyEditorRef}
              id="outreach-template-body"
              value={body}
              onChange={setBody}
              tagData={tagData}
              tags={sendTags}
              className={
                kind === 'text'
                  ? OUTREACH_TEMPLATE_TEXT_MESSAGE_EDITOR
                  : OUTREACH_TEMPLATE_MESSAGE_EDITOR
              }
              placeholder={
                kind === 'email'
                  ? 'Email message'
                  : 'Text message'
              }
              disabled={saving}
              onFocus={() => handleEditorFocus('body')}
              onBlur={handleEditorBlur}
            />
          </div>

          <p className="text-xs text-white/50 leading-relaxed">
            Insert lead fields and custom fields while editing — they resolve when you send.
          </p>
        </div>

        <DialogFooter
          className="px-6 pt-3 pb-6 border-t border-white/10 flex-shrink-0"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button
            type="button"
            variant="outline"
            className="send-form-btn send-form-btn--primary w-full min-h-[44px]"
            onClick={handleSave}
            disabled={saving || (isEdit && !hasChanges)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving…' : isEdit ? 'Save template' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OutreachTemplateEditorDialog
