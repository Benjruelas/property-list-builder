import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AVAILABLE_TAGS } from '@/utils/emailTemplates'
import {
  createOutreachTemplate,
  updateOutreachTemplateApi,
} from '@/utils/outreachTemplates'
import { showToast } from '../ui/toast'
import {
  OutreachTemplatePanelShell,
  OutreachTemplateFormBody,
  OutreachTemplateFormFooter,
} from './outreachTemplatePanelShared'

function TagBar({ onInsertTag }) {
  return (
    <div className="mb-2">
      <p className="text-xs mb-2 opacity-60">Insert tag</p>
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_TAGS.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs create-list-btn px-2"
            onMouseDown={(e) => {
              e.preventDefault()
              onInsertTag(tag)
            }}
          >
            {tag}
          </Button>
        ))}
      </div>
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
  nestedOverlay = true,
  topLayer = true,
}) {
  const isEdit = !!template?.id
  const initializedRef = useRef(false)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    setName(template?.name || '')
    setSubject(template?.subject ?? '')
    setBody(template?.body ?? '')
    setFocusedField(null)
  }, [open, template])

  const blurHandler = () => {
    setTimeout(() => {
      const el = document.activeElement
      if (el?.tagName !== 'TEXTAREA' && el?.tagName !== 'INPUT') setFocusedField(null)
    }, 200)
  }

  const insertTag = (tag) => {
    const token = `{${tag}}`
    if (kind === 'email' && focusedField === 'subject') setSubject((p) => p + token)
    else setBody((p) => p + token)
  }

  const hasChanges = isEdit
    ? name.trim() !== (template.name || '').trim()
      || subject !== (template.subject ?? '')
      || body !== (template.body ?? '')
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
        body,
        ...(kind === 'email' ? { subject } : {}),
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

  const title = isEdit ? 'Edit template' : 'New template'
  const subtitle = kind === 'email' ? 'Email outreach template' : 'Text message template'

  return (
    <OutreachTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      description={`${isEdit ? 'Edit' : 'Create'} ${kind} outreach template`}
      nestedOverlay={nestedOverlay}
      topLayer={topLayer}
      footer={(
        <OutreachTemplateFormFooter>
          <Button
            type="button"
            variant="outline"
            className="create-list-btn flex-1 sm:flex-none sm:min-w-[7rem]"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="create-list-btn flex-1 sm:flex-none sm:min-w-[7rem]"
            onClick={handleSave}
            disabled={saving || (isEdit && !hasChanges)}
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </OutreachTemplateFormFooter>
      )}
    >
      <OutreachTemplateFormBody>
        <div className="space-y-4 create-list-form max-w-none">
          <div>
            <label className="text-xs font-medium block mb-1.5 opacity-90">
              Name <span className="text-red-400">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'email' ? 'e.g. Initial contact' : 'e.g. Follow-up text'}
              className="text-sm h-11"
              autoFocus
            />
          </div>
          {kind === 'email' && (
            <div>
              <label className="text-xs font-medium block mb-1.5 opacity-90">Subject</label>
              {focusedField === 'subject' && <TagBar onInsertTag={insertTag} />}
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setFocusedField('subject')}
                onBlur={blurHandler}
                placeholder="Email subject line"
                className="text-sm h-11"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium block mb-1.5 opacity-90">
              {kind === 'email' ? 'Body' : 'Message'}
            </label>
            {focusedField === 'body' && <TagBar onInsertTag={insertTag} />}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setFocusedField('body')}
              onBlur={blurHandler}
              placeholder="Use {Owner Name}, {Address}, and other tags for dynamic fields."
              className="w-full min-h-[12rem] md:min-h-[14rem] p-3 text-sm rounded-lg border border-white/15 bg-white/[0.04] resize-y scrollbar-hide focus:outline-none focus:ring-2 focus:ring-white/25"
              rows={10}
            />
          </div>
          <p className="text-xs opacity-45 leading-relaxed">
            Tags like {'{First Name}'} and {'{Address}'} are replaced when you send from a lead or parcel.
          </p>
        </div>
      </OutreachTemplateFormBody>
    </OutreachTemplatePanelShell>
  )
}

export default OutreachTemplateEditorDialog
