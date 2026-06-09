import { ChevronUp, ListPlus, UserPlus, X } from 'lucide-react'
import { OwnerOccupiedBadge } from '@/components/OwnerOccupiedBadge'

/**
 * Static example parcel popup shown during the welcome tour (non-interactive).
 * Buttons mirror ParcelPopupV1 markup and classes exactly.
 */
export function TourDemoParcelPopup() {
  return (
    <div
      className="tour-demo-parcel-popup parcel-popup-card rounded-xl overflow-hidden min-w-[240px] max-w-[300px] shadow-xl"
      data-tour="parcel-demo-popup"
      aria-hidden
    >
      <div className="px-3 pt-3 pb-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="parcel-popup-card__title text-sm font-bold leading-tight truncate">
              1234 Oak Street
            </h3>
          </div>
          <p className="parcel-popup-card__muted text-xs truncate mt-0.5">Dallas, TX 75201</p>
          <p className="parcel-popup-card__muted text-xs truncate mt-0.5">Jane &amp; John Smith</p>
        </div>
        <span className="parcel-popup-card__close p-0.5 shrink-0 opacity-50" aria-hidden>
          <X size={14} />
        </span>
      </div>

      <div className="px-3 flex flex-wrap gap-1.5">
        <OwnerOccupiedBadge ownerOccupied={true} inParcelPopup />
        <span className="parcel-popup-card__chip inline-flex items-center px-2 py-0.5 rounded-full text-[10px]">
          24 yrs
        </span>
      </div>

      <div
        className="px-3 pt-2.5 pb-3 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          tabIndex={-1}
          data-tour="parcel-demo-details"
          className="parcel-popup-card__btn-secondary flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors pointer-events-none"
          title="More Details"
        >
          <ChevronUp size={12} />
          <span>Details</span>
        </button>
        <button
          type="button"
          tabIndex={-1}
          data-tour="parcel-demo-add-list"
          className="parcel-popup-card__btn-list p-2 rounded-lg transition-colors pointer-events-none"
          title="Add to List"
        >
          <ListPlus size={13} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          data-tour="parcel-demo-convert-lead"
          className="parcel-popup-card__btn-pipeline p-2 rounded-lg transition-colors pointer-events-none"
          title="Add to Pipeline"
        >
          <UserPlus size={13} />
        </button>
      </div>
    </div>
  )
}
