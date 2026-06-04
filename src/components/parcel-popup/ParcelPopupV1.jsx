import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { X, ChevronUp, ListPlus, UserPlus, CheckCircle2, Loader2 } from 'lucide-react'
import { OwnerOccupiedBadge } from '@/components/OwnerOccupiedBadge'
import { usePopupPosition } from './usePopupPosition'

/**
 * V1: Floating Card
 * Compact card, viewport-centered, with icon-row actions. "Details" opens the standalone panel.
 * Styled via .parcel-popup-card + ui-theme.css tokens (dark / light / glass).
 */
export function ParcelPopupV1({
  popupData, clickedParcelData, mapRef,
  onClose, onOpenDetails, onAddToList, onConvertToLead, isLead,
}) {
  const pos = usePopupPosition(mapRef, popupData?.lat, popupData?.lng)
  const cardRef = useRef(null)

  // Dismiss the popup on any pointer-down outside the card. Map-parcel clicks
  // will still replace the popup (the map click handler runs after the outside
  // dismissal — net effect is the same: popup shows for the newly clicked
  // parcel). Clicks inside the card keep it open via its own stopPropagation.
  useEffect(() => {
    if (!popupData) return
    const handlePointerDown = (e) => {
      const card = cardRef.current
      if (!card) return
      if (card.contains(e.target)) return
      if (
        e.target?.closest?.(
          [
            '.map-panel',
            '.list-panel',
            '.parcel-popup-card',
            '.map-controls-stack',
            '.map-search-stack',
            '[data-app-dialog-backdrop]',
            '[role="dialog"]',
          ].join(', ')
        )
      ) {
        return
      }
      onClose?.()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [popupData, onClose])

  if (!popupData || !pos) return null

  const card = (
    <div
      ref={cardRef}
      className="fixed z-[10000] transition-all duration-300 ease-out"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="parcel-popup-card rounded-xl overflow-hidden min-w-[240px] max-w-[300px]">
        <div className="px-3 pt-3 pb-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="parcel-popup-card__title text-sm font-bold leading-tight truncate">
                {popupData.address}
              </h3>
              {popupData.hasSkipTraced && (
                <CheckCircle2 size={14} className="parcel-popup-card__icon-success shrink-0" />
              )}
              {popupData.isSkipTracing && (
                <Loader2 size={14} className="parcel-popup-card__icon-pending animate-spin shrink-0" />
              )}
            </div>
            {popupData.ownerName && (
              <p className="parcel-popup-card__muted text-xs truncate mt-0.5">{popupData.ownerName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="parcel-popup-card__close p-0.5 shrink-0 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-3 flex flex-wrap gap-1.5">
          <OwnerOccupiedBadge ownerOccupied={popupData.ownerOccupied} inParcelPopup />
          {popupData.age !== null && popupData.age !== undefined && (
            <span className="parcel-popup-card__chip inline-flex items-center px-2 py-0.5 rounded-full text-[10px]">
              {popupData.age} yrs
            </span>
          )}
        </div>

        <div
          className="px-3 pt-2.5 pb-3 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenDetails?.() }}
            className="parcel-popup-card__btn-secondary flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            title="More Details"
          >
            <ChevronUp size={12} />
            <span>Details</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddToList?.() }}
            className="parcel-popup-card__btn-list p-2 rounded-lg transition-colors"
            title="Add to List"
          >
            <ListPlus size={13} />
          </button>
          {!isLead && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConvertToLead?.() }}
              className="parcel-popup-card__btn-pipeline p-2 rounded-lg transition-colors"
              title="Add to Pipeline"
            >
              <UserPlus size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(card, document.body)
}
