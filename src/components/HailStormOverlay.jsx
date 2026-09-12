import { useEffect, useState } from 'react'
import { Source, Layer, Marker as MapMarker, useMap } from 'react-map-gl/maplibre'
import { ChevronLeft, ChevronRight, CloudRain, Home, Loader2, X } from 'lucide-react'
import { formatEventTimeLocal, IEM_RADAR_TILE_MAXZOOM, radarDisplayName } from '../utils/nexradOverlay'

/** Parcel + hail report pins while viewing storm radar. */
export function HailStormMapMarkers({ parcel, event, address }) {
  if (!parcel?.lat || !parcel?.lng) return null

  const hasEvent =
    event?.lat != null &&
    event?.lng != null &&
    !Number.isNaN(Number(event.lat)) &&
    !Number.isNaN(Number(event.lng))

  const shortAddress =
    typeof address === 'string' && address.trim()
      ? address.trim().split(',')[0]
      : null

  return (
    <>
      {hasEvent ? (
        <MapMarker longitude={Number(event.lng)} latitude={Number(event.lat)} anchor="center">
          <div className="hail-storm-event-marker" title="Hail report location" aria-hidden>
            <span className="hail-storm-event-marker-core" />
            <span className="hail-storm-event-marker-ring" />
          </div>
        </MapMarker>
      ) : null}
      <MapMarker longitude={parcel.lng} latitude={parcel.lat} anchor="bottom">
        <div
          className="hail-storm-parcel-marker"
          role="img"
          aria-label={shortAddress ? `Property: ${shortAddress}` : 'Property location'}
        >
          {shortAddress ? (
            <span className="hail-storm-parcel-marker-label">{shortAddress}</span>
          ) : null}
          <div className="hail-storm-parcel-marker-pin-wrap">
            <div className="hail-storm-parcel-marker-pulse" aria-hidden />
            <div className="hail-storm-parcel-marker-pin">
              <Home className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </div>
          </div>
        </div>
      </MapMarker>
    </>
  )
}

const RADAR_LAYER_ID = 'hail-storm-radar-layer'

export function HailStormOverlay({ tileUrl }) {
  const maps = useMap()
  const mapRef = maps?.current
  // Keep the last good frame mounted so null/503 gaps don't blank the map.
  const [displayUrl, setDisplayUrl] = useState(tileUrl || null)

  useEffect(() => {
    if (tileUrl) setDisplayUrl(tileUrl)
  }, [tileUrl])

  useEffect(() => {
    const map = mapRef?.getMap?.() ?? mapRef
    if (!map || !displayUrl) return

    const promote = () => {
      try {
        if (map.getLayer(RADAR_LAYER_ID)) map.moveLayer(RADAR_LAYER_ID)
      } catch {
        /* style not ready */
      }
    }

    promote()
    map.on('styledata', promote)
    return () => {
      map.off('styledata', promote)
    }
  }, [mapRef, displayUrl])

  if (!displayUrl) return null

  return (
    <Source
      id="hail-storm-radar"
      type="raster"
      tiles={[displayUrl]}
      tileSize={256}
      scheme="xyz"
      minzoom={1}
      maxzoom={IEM_RADAR_TILE_MAXZOOM}
      attribution="NEXRAD via Iowa Environmental Mesonet"
    >
      <Layer
        id={RADAR_LAYER_ID}
        type="raster"
        paint={{ 'raster-opacity': 0.78, 'raster-fade-duration': 0 }}
      />
    </Source>
  )
}

const RADAR_LEGEND_STOPS = [
  { color: '#72f472', label: 'Light' },
  { color: '#f8f020', label: 'Mod' },
  { color: '#f09000', label: 'Heavy' },
  { color: '#e01010', label: 'Severe' },
  { color: '#f040f0', label: 'Hail' },
]

function StormRadarLegend() {
  return (
    <div className="hail-storm-legend" aria-label="Radar reflectivity key">
      <p className="hail-storm-legend-label">Radar key</p>
      <div className="hail-storm-legend-scale">
        {RADAR_LEGEND_STOPS.map((stop) => (
          <div key={stop.label} className="hail-storm-legend-stop">
            <span className="hail-storm-legend-swatch" style={{ background: stop.color }} aria-hidden />
            <span className="hail-storm-legend-stop-label">{stop.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatStormTitleDate(dateStr) {
  if (!dateStr) return 'Storm Event'
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function StormDetailField({ label, value, highlight }) {
  return (
    <div className="hail-storm-detail-field">
      <span className="hail-storm-detail-label">{label}</span>
      <span className={`hail-storm-detail-value${highlight ? ' hail-storm-detail-value-highlight' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

/** Storm map controls — docked above the mobile action bar. */
export function HailStormDismissPill({
  event,
  onDismiss,
  timeline,
}) {
  if (!event) return null

  const {
    frames = [],
    frameLabel,
    frameIndex,
    frameCount,
    loading,
    canStep,
    canPrev,
    canNext,
    stepPrev,
    stepNext,
    goToFrame,
    goToReportFrame,
    hasRadarData,
    isReportFrame,
    radarName,
    radarId,
  } = timeline ?? {}

  const radarOk = event?.year >= 1995
  const timeLabel = formatEventTimeLocal(event.time_utc, event.date, undefined, event)
  const siteLabel = radarDisplayName(radarId, radarName)
  const progressPct = timelineProgress(frameIndex, frameCount)
  const reportIdx = frames.findIndex((f) => f.offsetHours === 0)
  const reportMarkerPct =
    reportIdx >= 0 && frameCount > 1 ? timelineProgress(reportIdx, frameCount) : null

  const seekFromPointer = (clientX, target) => {
    if (!goToFrame || frameCount <= 1 || loading) return
    const track = target?.closest?.('.hail-storm-progress')?.querySelector('.hail-storm-progress-track')
      || target
    if (!track?.getBoundingClientRect) return
    const rect = track.getBoundingClientRect()
    if (!rect.width) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    goToFrame(ratio * (frameCount - 1))
  }

  return (
    <div className="hail-storm-panel-wrap" aria-label="Hail storm map controls">
      <div className="hail-storm-panel">
        <header className="hail-storm-panel-header">
          <button
            type="button"
            className="hail-storm-exit-btn"
            onClick={onDismiss}
            title="Exit storm map"
            aria-label="Exit storm map and return to Hail Data"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div className="hail-storm-panel-title-wrap">
            <p className="hail-storm-panel-title">{formatStormTitleDate(event.date)}</p>
            <p className="hail-storm-panel-subtitle">
              {timeLabel ? `Report ${timeLabel}` : 'NEXRAD radar replay'}
              {radarOk && siteLabel ? ` · ${siteLabel}` : ''}
            </p>
          </div>
          <span className="hail-storm-panel-badge" aria-hidden>
            <CloudRain className="h-5 w-5" />
          </span>
        </header>

        <div className="hail-storm-details hail-storm-details--row">
          <StormDetailField
            label="Distance"
            value={event.distance_mi != null ? `${event.distance_mi} mi` : null}
          />
          <StormDetailField
            label="Hail Size"
            value={event.hail_size_inches ? `${event.hail_size_inches}"` : null}
            highlight
          />
        </div>

        {radarOk ? <StormRadarLegend /> : null}

        {radarOk && canStep ? (
          <div className="hail-storm-panel-radar">
            <p className="hail-storm-radar-label">Radar Timeline</p>
            <div className="hail-storm-panel-timeline" role="toolbar" aria-label="Storm radar timeline">
              <button
                type="button"
                className="hail-storm-step-btn"
                onClick={stepPrev}
                disabled={loading || !canPrev}
                title="Earlier radar frame"
                aria-label="Earlier radar frame"
              >
                <ChevronLeft aria-hidden />
              </button>
              <div className="hail-storm-frame-info" aria-live="polite">
                {loading ? (
                  <span className="hail-storm-frame-loading">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Loading radar…
                  </span>
                ) : (
                  <span className="hail-storm-frame-time">{frameLabel}</span>
                )}
              </div>
              <button
                type="button"
                className="hail-storm-step-btn"
                onClick={stepNext}
                disabled={loading || !canNext}
                title="Later radar frame"
                aria-label="Later radar frame"
              >
                <ChevronRight aria-hidden />
              </button>
            </div>
            {!loading && frameCount > 0 ? (
              <div
                className="hail-storm-progress"
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={Math.max(0, frameCount - 1)}
                aria-valuenow={frameIndex}
                aria-label={`Radar timeline, ${isReportFrame ? 'at report time' : frameLabel}`}
                onPointerDown={(e) => {
                  if (e.button != null && e.button !== 0) return
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  seekFromPointer(e.clientX, e.currentTarget)
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return
                  seekFromPointer(e.clientX, e.currentTarget)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    stepPrev?.()
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    stepNext?.()
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    goToFrame?.(0)
                  } else if (e.key === 'End') {
                    e.preventDefault()
                    goToFrame?.(frameCount - 1)
                  }
                }}
              >
                <div className="hail-storm-progress-track">
                  <div
                    className="hail-storm-progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                  {reportMarkerPct != null ? (
                    <button
                      type="button"
                      className="hail-storm-progress-report"
                      style={{ left: `${reportMarkerPct}%` }}
                      title="Jump to hail report time"
                      aria-label="Jump to hail report time"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToReportFrame?.()
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : null}
                  <span
                    className="hail-storm-progress-thumb"
                    style={{ left: `${progressPct}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!radarOk ? (
          <p className="hail-storm-panel-status">Radar unavailable before 1995</p>
        ) : null}
        {radarOk && !loading && !hasRadarData && !canStep ? (
          <p className="hail-storm-panel-status">No radar data for this time</p>
        ) : null}
        {radarOk && !loading && !hasRadarData && canStep ? (
          <p className="hail-storm-panel-status">No radar tiles for this frame</p>
        ) : null}
      </div>
    </div>
  )
}

function timelineProgress(frameIndex, frameCount) {
  if (!frameCount || frameCount <= 1) return 0
  return (frameIndex / (frameCount - 1)) * 100
}
