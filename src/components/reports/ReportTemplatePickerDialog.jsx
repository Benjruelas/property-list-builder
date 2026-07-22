import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DEAL_TEMPLATE_LIST_ROW,
} from '../dealTemplates/dealTemplatePanelShared'

function reportTemplateSummary(template) {
  const count = (template?.sections || []).length
  if (!count) return 'No sections'
  return `${count} section${count !== 1 ? 's' : ''}`
}

export function ReportTemplatePickerDialog({
  open,
  onOpenChange,
  templates = [],
  preferredTemplateId = null,
  onSelect,
  nestedOverlay = true,
}) {
  const handleNoTemplate = () => {
    onSelect?.(null)
  }

  const handlePick = (template) => {
    onSelect?.(template)
  }

  return (
    <DealTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title="Choose a template"
      icon={FileText}
      description="Choose a report template or continue without one."
      nestedOverlay={nestedOverlay}
      panelClassName="compact-picker-panel"
      footer={
        <div
          className="flex justify-end gap-2 px-5 py-3 flex-shrink-0 border-t border-white/10"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-md opacity-70 hover:opacity-100 hover:bg-white/10"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
        </div>
      }
    >
      <DealTemplatePanelScroll className="space-y-1.5">
        <button
          type="button"
          onClick={handleNoTemplate}
          className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer border-white/20 bg-white/[0.06]')}
        >
          <div className="text-sm font-medium">No template</div>
          <div className="text-xs opacity-60">Start with a blank report</div>
        </button>

        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePick(t)}
            className={cn(
              DEAL_TEMPLATE_LIST_ROW,
              'w-full text-left cursor-pointer',
              preferredTemplateId === t.id && 'border-white/30 bg-white/[0.08]',
            )}
          >
            <div className="text-sm font-medium truncate">{t.name || t.title || 'Template'}</div>
            <div className="text-xs opacity-60 truncate">{reportTemplateSummary(t)}</div>
          </button>
        ))}

      </DealTemplatePanelScroll>
    </DealTemplatePanelShell>
  )
}
