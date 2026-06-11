import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './dialog'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './panel-header'
import { cn } from '@/lib/utils'

/** Visible panel chrome while a lazy list panel chunk is still loading. */
export function PanelListLoadingShell({ open, title, onBack, className }) {
  if (!open) return null
  return (
    <Dialog open modal={false} onOpenChange={() => onBack?.()}>
      <DialogContent
        className={cn('map-panel list-panel fullscreen-panel flex flex-col min-h-0 p-0', className)}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">{title}</DialogDescription>
          <PanelHeader onBack={onBack} title={title} />
        </DialogHeader>
        <div className="flex-1 flex items-center justify-center min-h-0" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin opacity-60" aria-hidden />
          <span className="sr-only">Loading {title}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PanelListBodyLoading() {
  return (
    <div className="flex justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin opacity-60" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  )
}
