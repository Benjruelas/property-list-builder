import { useState, useCallback, useEffect, useMemo } from 'react'
import { X, CloudRain, Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'

const hailDataCache = new Map()
const HAIL_CACHE_TTL_MS = 30 * 60 * 1000

function HailSizeIndicator({ inches }) {
  if (!inches) return null
  const color = inches < 1 ? 'bg-yellow-500' : inches < 2 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[2rem] h-5 px-1.5 ${color}`}>
      {inches}"
    </span>
  )
}

function HailYearGroup({ year, events, defaultOpen, onSelectEvent }) {
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
            <button
              key={i}
              type="button"
              onClick={() => onSelectEvent?.(evt)}
              className="hail-event-row w-full flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded-md text-left bg-transparent hover:bg-white/10 transition-colors"
              title="View storm on map"
            >
              <span className="opacity-50 w-20 shrink-0">{evt.date || year}</span>
              <HailSizeIndicator inches={evt.hail_size_inches} />
              <span className="opacity-40 ml-auto shrink-0">{evt.distance_mi} mi</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function HailDataPanel({ isOpen, onClose, parcelData, onSelectEvent }) {
  const [hailData, setHailData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const address = parcelData?.address || parcelData?.properties?.SITUS_ADDR || 'Unknown address'
  const lat = parcelData?.lat ?? parcelData?.properties?.LATITUDE
  const lng = parcelData?.lng ?? parcelData?.properties?.LONGITUDE

  const loadHail = useCallback(async () => {
    if (!lat || !lng) return
    const cacheKey = `${lat},${lng}`
    const cached = hailDataCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < HAIL_CACHE_TTL_MS) {
      setHailData(cached.data)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/hail-events?lat=${lat}&lng=${lng}&radius_miles=10&from_year=2010`)
      if (!res.ok) throw new Error(`Hail API: ${res.status}`)
      const data = await res.json()
      hailDataCache.set(cacheKey, { data, fetchedAt: Date.now() })
      setHailData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => {
    if (isOpen && lat && lng) {
      loadHail()
    }
  }, [isOpen, lat, lng, loadHail])

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
        <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Hail history and storm data for this property</DialogDescription>
          <PanelHeader onBack={onClose} title="Hail Data" icon={CloudRain} subtitle={address} />
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1 min-h-0 space-y-4">

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
                      onSelectEvent={onSelectEvent}
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
