import { Users, User } from 'lucide-react'
import { PanelBackButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'

/**
 * Compact pipeline picker (move deal, assign task to a pipe, etc.).
 */
export function MoveDealDialog({
  open,
  onOpenChange,
  pipelines,
  currentUser,
  onSelect,
  title = 'Add to which pipeline?',
  description = 'Choose a pipeline to convert this parcel into a lead.',
  allowNoPipe = false,
  noPipeLabel = 'No pipe',
  noPipeDescription = 'Only you will see this task.',
  onSelectNoPipe,
  topLayer = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel move-deal-dialog max-w-xs p-0 gap-0 overflow-hidden border border-white/15 rounded-2xl"
        showCloseButton={false}
        blurOverlay
        topLayer={topLayer}
      >
        <div className="map-panel-header-toolbar map-panel-header-toolbar--top gap-2 px-4 pt-4 pb-3 border-b border-white/15">
          <div className="map-panel-header-title-wrap flex min-w-0 items-start gap-3">
            <PanelBackButton onClick={() => onOpenChange(false)} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold text-white/95">{title}</DialogTitle>
              <DialogDescription className="text-sm text-white/65 mt-1">
                {description}
              </DialogDescription>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4 max-h-[min(60vh,320px)] overflow-y-auto">
          {pipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left rounded-lg px-3 py-3 border border-white/15 bg-white/[0.08] hover:bg-white/15 text-white/95 text-sm font-medium transition-colors flex items-center gap-2"
              onClick={() => onSelect(p.id)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{p.title?.trim() || 'Pipes'}</span>
                {p.ownerId && p.ownerId !== currentUser?.uid && (
                  <Users className="h-3.5 w-3.5 flex-shrink-0 text-white/70" title="Shared with you" aria-hidden />
                )}
              </div>
            </button>
          ))}
          {allowNoPipe && (
            <button
              type="button"
              className="w-full text-left rounded-lg px-3 py-3 border border-white/15 bg-white/[0.05] hover:bg-white/10 text-white/90 text-sm font-medium transition-colors flex items-center gap-2"
              onClick={() => {
                if (typeof onSelectNoPipe === 'function') onSelectNoPipe()
              }}
            >
              <User className="h-4 w-4 flex-shrink-0 text-white/70" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{noPipeLabel}</span>
                {noPipeDescription && (
                  <span className="text-xs text-white/60 truncate">{noPipeDescription}</span>
                )}
              </div>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
