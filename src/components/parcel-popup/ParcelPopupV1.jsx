import { createPortal } from 'react-dom'
import { X, ChevronUp, ListPlus, UserPlus, CheckCircle2, Loader2 } from 'lucide-react'
import { OwnerOccupiedBadge } from '@/components/OwnerOccupiedBadge'
import { usePopupPosition } from './usePopupPosition'

/**
 * V1: Floating Card
 * Compact card, viewport-centered, with icon-row actions. "Details" opens the standalone panel.
 */
export function ParcelPopupV1({
  popupData, clickedParcelData, mapRef,
  onClose, onOpenDetails, onAddToList, onConvertToLead, isLead,
}) {
  const pos = usePopupPosition(mapRef, popupData?.lat, popupData?.lng)

  if (!popupData || !pos) return null

  const card = (
    <div
      className="fixed z-[10000] transition-all duration-300 ease-out"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="rounded-xl overflow-hidden min-w-[240px] max-w-[300px]" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-bold leading-tight truncate text-white/95">{popupData.address}</h3>
              {popupData.hasSkipTraced && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
              {popupData.isSkipTracing && <Loader2 size={14} className="text-amber-400 animate-spin shrink-0" />}
            </div>
            {popupData.ownerName && <p className="text-xs text-white/60 truncate mt-0.5">{popupData.ownerName}</p>}
          </div>
          <button onClick={() => onClose?.()} className="text-white/60 hover:text-white/90 p-0.5 shrink-0"><X size={14} /></button>
        </div>

        {/* Badges */}
        <div className="px-3 flex flex-wrap gap-1.5">
          <OwnerOccupiedBadge ownerOccupied={popupData.ownerOccupied} />
          {popupData.age !== null && popupData.age !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white/70">{popupData.age} yrs</span>
          )}
        </div>

        {/* Action Icons — Details, Add to List, Add to pipeline only */}
        <div className="px-3 pt-2.5 pb-3 flex items-center gap-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenDetails?.() }} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium transition-colors" title="More Details">
            <ChevronUp size={12} /><span>Details</span>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onAddToList?.() }} className="p-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors" title="Add to List"><ListPlus size={13} /></button>
          {!isLead && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onConvertToLead?.() }} className="p-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white transition-colors" title="Add to Pipeline"><UserPlus size={13} /></button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(card, document.body)
}
