/**
 * Map parcel popup (V1) — green when owner-occupied, amber when absentee.
 * Accepts popup-style values: 'Yes' | 'No' | null | true (legacy).
 */
export function OwnerOccupiedBadge({ ownerOccupied, inParcelPopup = false }) {
  if (ownerOccupied == null) return null
  const yes = ownerOccupied === true || ownerOccupied === 'Yes'
  if (inParcelPopup) {
    return yes ? (
      <span className="parcel-popup-owner-badge--yes inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold">
        Owner Occupied
      </span>
    ) : (
      <span className="parcel-popup-owner-badge--no inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold">
        Absentee Owner
      </span>
    )
  }
  return yes ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/15 text-green-400">
      Owner Occupied
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">
      Absentee Owner
    </span>
  )
}
