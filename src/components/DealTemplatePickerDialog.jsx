import { useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { getDealTemplates, dealTemplateSummary } from '@/utils/dealTemplates'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DealTemplateEmptyState,
  DEAL_TEMPLATE_LIST_ROW,
} from './dealTemplates/dealTemplatePanelShared'

export function DealTemplatePickerDialog({
  open,
  onOpenChange,
  onSelect,
  nestedOverlay = true,
}) {
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    if (open) setTemplates(getDealTemplates())
  }, [open])

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
      icon={Briefcase}
      subtitle="Start from a saved template or create a blank deal."
      description="Choose a deal template or continue without one."
      nestedOverlay={nestedOverlay}
      footer={
        <div
          className="flex justify-end gap-2 px-5 py-3 flex-shrink-0 border-t border-white/10"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
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
          <div className="text-xs opacity-60">Start with an empty deal form</div>
        </button>

        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePick(t)}
            className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
          >
            <div className="text-sm font-medium truncate">{t.name}</div>
            <div className="text-xs opacity-60 truncate">{dealTemplateSummary(t)}</div>
          </button>
        ))}

        {templates.length === 0 && (
          <DealTemplateEmptyState
            icon={Briefcase}
            title="No saved templates yet."
            hint="Open Deals → menu (⋮) → Create deal template to add one."
          />
        )}
      </DealTemplatePanelScroll>
    </DealTemplatePanelShell>
  )
}

export default DealTemplatePickerDialog
