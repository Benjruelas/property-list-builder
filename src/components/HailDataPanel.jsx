import { useState, useCallback, useEffect, useMemo } from 'react'
import { CloudRain, Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'

const hailDataCache = new Map()
const HAIL_CACHE_TTL_MS = 30 * 60 * 1000

function resolveParcelCoords(parcelData) {
  if (!parcelData) return { lat: null, lng: null }
  const props = parcelData.properties ?? {}
  const lat =
    parcelData.lat ??
    parcelData.latlng?.lat ??
    props.LATITUDE ??
    props.latitude
  const lng =
    parcelData.lng ??
    parcelData.latlng?.lng ??
    props.LONGITUDE ??
    props.longitude
  const latN = lat != null ? Number(lat) : null
  const lngN = lng != null ? Number(lng) : null
  return {
    lat: latN != null && !Number.isNaN(latN) ? latN : null,
    lng: lngN != null && !Number.isNaN(lngN) ? lngN : null,
  }
}

function formatEventTime(timeUtc) {
  if (!timeUtc) return null
  const [h, m] = String(timeUtc).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return timeUtc
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period} UTC`
}

function hailSizeColor(inches) {
  if (!inches) return 'bg-slate-500'
  if (inches < 1) return 'bg-yellow-500'
  if (inches < 2) return 'bg-orange-500'
  return 'bg-red-500'
}

function HailSizeIndicator({ inches, size = 'md' }) {
  if (!inches) return <span className="hail-data-field-value">—</span>
  const sizeClass = size === 'lg' ? 'hail-size-badge-lg' : 'hail-size-badge'
  return (
    <span className={`${sizeClass} ${hailSizeColor(inches)}`}>
      {inches}"
    </span>
  )
}

function HailEventRow({ evt, year, onSelectEvent }) {
  const timeLabel = formatEventTime(evt.time_utc)

  return (
    <button
      type="button"
      onClick={() => onSelectEvent?.(evt)}
      className="hail-event-row w-full text-left bg-transparent transition-colors"
      title="View storm on map"
    >
      <div className="hail-event-row-grid">
        <div className="hail-data-field">
          <span className="hail-data-field-label">Date</span>
          <span className="hail-data-field-value">{evt.date || year}</span>
        </div>
        <div className="hail-data-field">
          <span className="hail-data-field-label">Size</span>
          <HailSizeIndicator inches={evt.hail_size_inches} />
        </div>
        <div className="hail-data-field">
          <span className="hail-data-field-label">Distance</span>
          <span className="hail-data-field-value">{evt.distance_mi != null ? `${evt.distance_mi} mi` : '—'}</span>
        </div>
        {timeLabel ? (
          <div className="hail-data-field">
            <span className="hail-data-field-label">Time</span>
            <span className="hail-data-field-value">{timeLabel}</span>
          </div>
        ) : null}
      </div>
    </button>
  )
}

function HailYearGroup({ year, events, defaultOpen, onSelectEvent }) {
  const [open, setOpen] = useState(defaultOpen)
  const maxSize = events.reduce((m, e) => Math.max(m, e.hail_size_inches || 0), 0)
  const severityClass =
    maxSize >= 2 ? 'hail-data-severity-high' : maxSize >= 1 ? 'hail-data-severity-mid' : 'hail-data-severity-low'

  return (
    <div className="hail-data-year-group">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2.5 text-left bg-transparent"
      >
        <ChevronDown className={`h-4 w-4 hail-data-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-sm font-semibold flex-1">{year}</span>
        <span className={`text-xs font-medium ${severityClass}`}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
        {maxSize > 0 && <HailSizeIndicator inches={maxSize} />}
      </button>
      {open && (
        <div className="pl-2 pb-2 space-y-2">
          {events.map((evt, i) => (
            <HailEventRow key={i} evt={evt} year={year} onSelectEvent={onSelectEvent} />
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
  const { lat, lng } = resolveParcelCoords(parcelData)
  const coordKey = lat != null && lng != null ? `${lat},${lng}` : null

  const loadHail = useCallback(async () => {
    if (!lat || !lng) return
    const cacheKey = `${lat},${lng}`
    const cached = hailDataCache.get(cacheKey)
    const cacheFresh = cached && Date.now() - cached.fetchedAt < HAIL_CACHE_TTL_MS
    if (cacheFresh) {
      setHailData(cached.data)
      setError(null)
      setLoading(false)
    } else {
      setLoading(true)
      setError(null)
    }

    try {
      const res = await fetch(`/api/hail-events?lat=${lat}&lng=${lng}&radius_miles=10&from_year=2010`)
      if (!res.ok) throw new Error(`Hail API: ${res.status}`)
      const data = await res.json()
      hailDataCache.set(cacheKey, { data, fetchedAt: Date.now() })
      setHailData(data)
      setError(null)
    } catch (e) {
      if (!cacheFresh) setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => {
    if (!isOpen || !lat || !lng) return
    setHailData(null)
    setError(null)
    loadHail()
  }, [isOpen, coordKey, loadHail, lat, lng])

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
        className="map-panel hail-data-panel list-panel fullscreen-panel flex flex-col min-h-0"
        showCloseButton={false}
        hideOverlay
        topLayer
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Hail history and storm data for this property</DialogDescription>
          <PanelHeader onBack={onClose} title="Hail Data" icon={CloudRain} subtitle={address} />
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1 min-h-0 space-y-4">

          {loading ? (
            <div className="flex items-center justify-center py-12 hail-data-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-base">Loading hail history...</span>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 py-4 text-base hail-data-error-text">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>Could not load hail data: {error}</span>
              </div>
              <button
                type="button"
                onClick={loadHail}
                className="hail-data-retry-btn w-full flex items-center justify-center gap-2 text-base font-medium px-4 py-3 rounded-lg transition-colors"
              >
                <CloudRain className="h-5 w-5" />
                Retry
              </button>
            </div>
          ) : hailData ? (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="hail-data-stat-card rounded-lg px-3 py-3 text-center">
                  <div className="text-2xl font-bold">{hailData.summary?.total_events ?? 0}</div>
                  <div className="text-xs hail-data-stat-label mt-0.5">Total Events</div>
                </div>
                <div className="hail-data-stat-card rounded-lg px-3 py-3 text-center">
                  <div className="text-2xl font-bold">{hailData.summary?.max_hail_size ? `${hailData.summary.max_hail_size}"` : '—'}</div>
                  <div className="text-xs hail-data-stat-label mt-0.5">Max Size</div>
                </div>
                <div className="hail-data-stat-card rounded-lg px-3 py-3 text-center">
                  <div className="text-2xl font-bold">{hailData.summary?.years_with_hail?.length ?? 0}</div>
                  <div className="text-xs hail-data-stat-label mt-0.5">Years w/ Hail</div>
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
                <div className="text-base hail-data-muted text-center py-4">
                  No hail events found within {hailData.radius_miles ?? 10} miles
                </div>
              )}

              <div className="text-xs hail-data-muted text-center mt-4">
                NOAA Storm Prediction Center · Within {hailData.radius_miles} miles · Since {Math.min(...(hailData.summary?.years_with_hail || [new Date().getFullYear()]))}
              </div>
            </div>
          ) : null}

        </div>
      </DialogContent>
    </Dialog>
  )
}
