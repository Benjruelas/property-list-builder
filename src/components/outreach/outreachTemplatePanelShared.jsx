import { cn } from '@/lib/utils'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from '../ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'

export const OUTREACH_TEMPLATE_PANEL_CLASS =
  'map-panel list-panel outreach-template-panel fullscreen-panel flex flex-col min-h-0 p-0'

export const OUTREACH_TEMPLATE_BODY_STYLE = {
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
}

export function OutreachTemplatePanelShell({
  open,
  onOpenChange,
  title,
  subtitle,
  description,
  nestedOverlay = true,
  topLayer = true,
  children,
  footer,
}) {
  return (
    <Dialog open={open} modal={false} onOpenChange={onOpenChange}>
      <DialogContent
        className={OUTREACH_TEMPLATE_PANEL_CLASS}
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
        hideOverlay
        suppressBackdrop
      >
        <DialogHeader
          className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-3 !text-left items-start w-full space-y-0')}
          style={PANEL_LIST_HEADER_STYLE}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title={title}
            subtitle={subtitle}
            subtitleClassName={subtitle ? 'text-sm opacity-60 whitespace-normal' : undefined}
            titleClassName={subtitle ? 'text-left justify-start' : undefined}
            toolbarClassName={subtitle ? 'w-full' : undefined}
          />
          {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="flex flex-col flex-1 min-h-0 outreach-template-form"
          onSubmit={(e) => e.preventDefault()}
        >
          {children}
          {footer}
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OutreachTemplateFormBody({ children, className }) {
  return (
    <div
      className={cn(
        'outreach-template-form-body flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4',
        className,
      )}
      style={OUTREACH_TEMPLATE_BODY_STYLE}
    >
      {children}
    </div>
  )
}

export function OutreachTemplateFormFooter({ children }) {
  return (
    <div className="outreach-template-form-footer flex-shrink-0 flex gap-2 px-5 py-4 border-t border-white/10">
      {children}
    </div>
  )
}
