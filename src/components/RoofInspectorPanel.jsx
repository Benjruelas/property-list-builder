import { useState, useCallback, useEffect, useMemo } from 'react'
import { X, CloudRain, Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'

function HailSizeIndicator({ inches }) {
  if (!inches) return null
  const color = inches < 1 ? 'bg-yellow-500' : inches < 2 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[2rem] h-5 px-1.5 ${color}`}>
      {inches}"
    </span>
  )
}

function HailYearGroup({ year, events, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const maxSize = events.reduce((m, e) => Math.max(m, e.hail_size_inches || 0), 0)
  const severityColor = maxSize >= 2 ? 'text-red-400' : maxSize >= 1 ? 'text-orange-400' : 'text-yellow-400'

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2 text-left bg-transparent"
      >
        <ChevronDown className={`h-3.5 w-3.5 opacity-50 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-xs font-semibold flex-1">{year}</span>
        <span className={`text-[10px] font-medium ${severityColor}`}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
        {maxSize > 0 && <HailSizeIndicator inches={maxSize} />}
      </button>
      {open && (
        <div className="pl-6 pb-2 space-y-0.5">
          {events.map((evt, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1">
              <span className="opacity-50 w-20 shrink-0">{evt.date || year}</span>
              <HailSizeIndicator inches={evt.hail_size_inches} />
              <span className="opacity-40 ml-auto shrink-0">{evt.distance_mi} mi</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RoofInspectorPanel({ isOpen, onClose, parcelData }) {
  const [hailData, setHailData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const address = parcelData?.address || parcelData?.properties?.SITUS_ADDR || 'Unknown address'
  const lat = parcelData?.lat ?? parcelData?.properties?.LATITUDE
  const lng = parcelData?.lng ?? parcelData?.properties?.LONGITUDE

  const loadHail = useCallback(async () => {
    if (!lat || !lng) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/hail-events?lat=${lat}&lng=${lng}&radius_miles=10&from_year=2010`)
      if (!res.ok) throw new Error(`Hail API: ${res.status}`)
      setHailData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => {
    if (isOpen && lat && lng) {
      setHailData(null)
      setError(null)
      loadHail()
    }
  }, [isOpen, lat, lng])

  const hailByYear = useMemo(() => {
    if (!hailData?.events?.length) return []
    const groups = {}
    for (const evt of hailData.events) {
      const y = evt.year
      if (!groups[y]) groups[y] = []
      groups[y].push(evt)
    }
    return Object.entries(groups)
      .map(([year, events]) => ({ year: parseInt(year, 10), events }))
      .sort((a, b) => b.year - a.year)
  }, [hailData])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel flex flex-col min-h-0"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/20" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Hail history and storm data for this property</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <CloudRain className="h-5 w-5 shrink-0" />
              <span className="truncate">Hail Data</span>
            </DialogTitle>
            <div className="map-panel-header-actions gap-1">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-xs opacity-50 mt-1 truncate">{address}</div>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto scrollbar-hide flex-1 min-h-0 space-y-4">

          {loading ? (
            <div className="flex items-center justify-center py-12 opacity-50">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading hail history...</span>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 py-4 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not load hail data: {error}</span>
              </div>
              <button
                type="button"
                onClick={loadHail}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <CloudRain className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : hailData ? (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                  <div className="text-lg font-bold">{hailData.summary?.total_events ?? 0}</div>
                  <div className="text-[10px] opacity-50">Events</div>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                  <div className="text-lg font-bold">{hailData.summary?.max_hail_size ? `${hailData.summary.max_hail_size}"` : '--'}</div>
                  <div className="text-[10px] opacity-50">Max Size</div>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                  <div className="text-lg font-bold">{hailData.summary?.years_with_hail?.length ?? 0}</div>
                  <div className="text-[10px] opacity-50">Years</div>
                </div>
              </div>

              {hailByYear.length > 0 ? (
                <div>
                  {hailByYear.map((group, i) => (
                    <HailYearGroup
                      key={group.year}
                      year={group.year}
                      events={group.events}
                      defaultOpen={i === 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm opacity-40 text-center py-4">No hail events found within 5 miles</div>
              )}

              <div className="text-[10px] opacity-30 text-center mt-4">
                NOAA Storm Prediction Center · Within {hailData.radius_miles} miles · Since {Math.min(...(hailData.summary?.years_with_hail || [new Date().getFullYear()]))}
              </div>
            </div>
          ) : null}

        </div>
      </DialogContent>
    </Dialog>
  )
}
