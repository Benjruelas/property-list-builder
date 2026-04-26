// Paused: not mounted from App.jsx — re-enable import + <RoofInspectorPanel /> there.
import { useMemo } from 'react'
import { X, Telescope, MapPin, ExternalLink } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'

function parseCoord(v) {
  if (v == null || v === '') return null
  const n = Number.parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Aerial / structural review for the parcel. Entry point for future roof imagery,
 * measurements, and reports. Uses the same full-screen map-panel shell as HailData.
 */
export function RoofInspectorPanel({ isOpen, onClose, parcelData }) {
  const address = parcelData?.address || parcelData?.properties?.SITUS_ADDR || 'Unknown address'
  const rawLat = parcelData?.lat ?? parcelData?.properties?.LATITUDE
  const rawLng = parcelData?.lng ?? parcelData?.properties?.LONGITUDE
  const lat = parseCoord(rawLat)
  const lng = parseCoord(rawLng)
  const hasCoords = lat != null && lng != null

  const mapsUrl = useMemo(() => {
    if (hasCoords) {
      return `https://www.google.com/maps/@${lat},${lng},20z`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }, [hasCoords, lat, lng, address])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel flex flex-col min-h-0"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/20" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Roof and aerial review for this property</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <Telescope className="h-5 w-5 shrink-0" />
              <span className="truncate">Roof Inspector</span>
            </DialogTitle>
            <div className="map-panel-header-actions gap-1">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-xs opacity-50 mt-1 truncate">{address}</div>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto scrollbar-hide flex-1 min-h-0 space-y-4 text-sm text-white/80">
          <p>
            Use aerial imagery to review the building footprint, roof condition, and site context. Open the location
            in Google Maps (switch to satellite for roof detail) or continue here as we add in-app roof tools.
          </p>
          {hasCoords ? (
            <div className="flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white/60">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5 opacity-50" />
              <span>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            </div>
          ) : (
            <div className="text-xs text-amber-200/80">
              No coordinates on this record — the link below uses the address only.
            </div>
          )}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600/80 hover:bg-sky-600 text-white text-sm font-medium px-4 py-3 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            Open in Google Maps
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
