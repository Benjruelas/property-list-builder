import { X, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'

/**
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, pipelines: Array<{ id: string, title?: string, ownerId?: string }>, currentUser: { uid?: string } | null, onSelect: (pipelineId: string) => void }} props
 */
export function ConvertToLeadPipelineDialog({ open, onOpenChange, pipelines, currentUser, onSelect, title = 'Add to which pipeline?', description = 'Choose a pipeline to convert this parcel into a lead.' }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel convert-to-lead-pipeline-dialog max-w-xs p-0 gap-0 overflow-hidden border border-white/15 rounded-2xl"
        showCloseButton={false}
        blurOverlay
      >
        <div className="map-panel-header-toolbar map-panel-header-toolbar--top gap-2 px-4 pt-4 pb-3 border-b border-white/15">
          <div className="map-panel-header-title-wrap min-w-0">
            <DialogTitle className="text-lg font-semibold text-white/95">{title}</DialogTitle>
            <DialogDescription className="text-sm text-white/65 mt-1">
              {description}
            </DialogDescription>
          </div>
          <div className="map-panel-header-actions">
            <button type="button" className="pipeline-icon-btn flex-shrink-0 p-1 rounded-md text-white/60 hover:text-white/90 transition-colors" onClick={() => onOpenChange(false)} title="Close">
              <X className="h-4 w-4" />
            </button>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
