import { QuoteIcon } from '../icons/QuoteIcon'
import { cn } from '@/lib/utils'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DealTemplateEmptyState,
  DEAL_TEMPLATE_LIST_ROW,
} from '../dealTemplates/dealTemplatePanelShared'

function quoteTemplateSummary(template) {
  const count = (template?.lineItems || []).length
  if (!count) return 'No line items'
  return `${count} line item${count !== 1 ? 's' : ''}`
}

export function QuoteTemplatePickerDialog({
  open,
  onOpenChange,
  templates = [],
  onSelect,
  nestedOverlay = true,
}) {
  const handleNoTemplate = () => {
    onSelect?.(null)
    onOpenChange(false)
  }

  const handlePick = (template) => {
    onSelect?.(template)
    onOpenChange(false)
  }

  return (
    <DealTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title="Choose a template"
      icon={QuoteIcon}
      subtitle="Start from a saved template or create a blank quote."
      description="Choose a quote template or continue without one."
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
          <div className="text-xs opacity-60">Start with an empty quote</div>
        </button>

        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePick(t)}
            className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
          >
            <div className="text-sm font-medium truncate">{t.name || t.title || 'Template'}</div>
            <div className="text-xs opacity-60 truncate">{quoteTemplateSummary(t)}</div>
          </button>
        ))}

        {templates.length === 0 && (
          <DealTemplateEmptyState
            icon={QuoteIcon}
            title="No saved templates yet."
            hint="Use “No template” above, or save a quote layout as a template from the Templates tab."
          />
        )}
      </DealTemplatePanelScroll>
    </DealTemplatePanelShell>
  )
}
