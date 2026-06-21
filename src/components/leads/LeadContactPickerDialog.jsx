import { cn } from '@/lib/utils'
import {
  DealTemplatePanelShell,
  DEAL_TEMPLATE_LIST_ROW,
  DEAL_TEMPLATE_SAFE_BODY_STYLE,
} from '../dealTemplates/dealTemplatePanelShared'
import { LeadContactSourceIcon } from './LeadContactSourceIcon'

export function LeadContactPickerDialog({
  open,
  onOpenChange,
  title,
  icon: Icon,
  subtitle,
  description,
  items = [],
  onSelect,
  nestedOverlay = true,
}) {
  const handlePick = (item) => {
    onSelect?.(item.value)
    onOpenChange(false)
  }

  return (
    <DealTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      icon={Icon}
      subtitle={subtitle}
      description={description || subtitle}
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
      <div
        className="compact-picker-scroll px-4 py-3 space-y-1.5"
        style={DEAL_TEMPLATE_SAFE_BODY_STYLE}
      >
        {items.map((item, index) => (
          <button
            key={`${item.value}-${index}`}
            type="button"
            onClick={() => handlePick(item)}
            className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
          >
            <div className="flex items-start gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{item.title}</div>
                {item.subtitle ? (
                  <div className="text-xs opacity-60 truncate">{item.subtitle}</div>
                ) : null}
              </div>
              {item.detail ? (
                <LeadContactSourceIcon detail={item.detail} className="h-3.5 w-3.5 mt-0.5 opacity-70" />
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </DealTemplatePanelShell>
  )
}
