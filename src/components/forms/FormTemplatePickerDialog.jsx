import { useEffect, useState } from 'react'
import { FileText, Upload, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { fetchTemplates } from '@/utils/forms'
import { createFormFromPdfFile, pickFormPdfFile } from '@/utils/formCreate'
import { showToast } from '../ui/toast'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DealTemplateEmptyState,
  DEAL_TEMPLATE_LIST_ROW,
} from '../dealTemplates/dealTemplatePanelShared'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

export function FormTemplatePickerDialog({
  open,
  onOpenChange,
  onSelect,
  getToken,
  nestedOverlay = true,
  uploading: externalUploading = false,
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open || !getToken) return
    let cancelled = false
    setLoading(true)
    fetchTemplates(getToken)
      .then((list) => {
        if (!cancelled) setTemplates(list)
      })
      .catch((e) => {
        if (!cancelled) showToast(e.message || 'Failed to load forms', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, getToken])

  const handlePick = (template) => {
    onSelect?.(template)
    onOpenChange(false)
  }

  const handleUploadNew = async () => {
    if (!getToken || uploading || externalUploading) return
    const file = await pickFormPdfFile()
    if (!file) return
    setUploading(true)
    try {
      const created = await createFormFromPdfFile(getToken, file)
      showToast('Form created. Add fields, then save.', 'success')
      onSelect?.(created, { isNew: true })
      onOpenChange(false)
    } catch (e) {
      showToast(e.message || 'Failed to create form', 'error')
    } finally {
      setUploading(false)
    }
  }

  const busy = uploading || externalUploading

  return (
    <DealTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title="Choose a form"
      icon={FileText}
      nestedOverlay={nestedOverlay}
      panelClassName="compact-picker-panel"
      footer={
        <div
          className="flex justify-end gap-2 px-5 py-3 flex-shrink-0 border-t border-white/10"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <DealTemplatePanelScroll className="space-y-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={handleUploadNew}
          className={cn(
            DEAL_TEMPLATE_LIST_ROW,
            'w-full text-left cursor-pointer border-white/20 bg-white/[0.06] disabled:opacity-50',
          )}
        >
          <div className="flex items-center gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
            ) : (
              <Upload className="h-4 w-4 shrink-0 opacity-70" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium">Upload new form</div>
              <div className="text-xs opacity-60">Import a PDF and place fields</div>
            </div>
          </div>
        </button>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs opacity-50 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading forms…
          </div>
        ) : templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePick(t)}
            className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
          >
            <div className="text-sm font-medium truncate">{t.name || 'Untitled form'}</div>
            <div className="text-xs opacity-60 truncate">
              {(t.fields?.length || 0)} field{(t.fields?.length || 0) === 1 ? '' : 's'}
              {t.updatedAt ? ` · ${formatDate(t.updatedAt)}` : ''}
            </div>
          </button>
        ))}

        {!loading && templates.length === 0 && (
          <DealTemplateEmptyState
            icon={FileText}
            title="No saved forms yet."
            hint="Upload a PDF above or create one from the Forms panel."
          />
        )}
      </DealTemplatePanelScroll>
    </DealTemplatePanelShell>
  )
}

export default FormTemplatePickerDialog
