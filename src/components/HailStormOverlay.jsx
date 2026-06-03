import { Source, Layer, Marker as MapMarker } from 'react-map-gl/maplibre'
import { ChevronLeft, ChevronRight, CloudRain, Home, Loader2, X } from 'lucide-react'

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

export function HailStormOverlay({ tileUrl }) {
  if (!tileUrl) return null

  return (
    <Source
      id="hail-storm-radar"
      type="raster"
      tiles={[tileUrl]}
      tileSize={256}
      attribution="NEXRAD via Iowa Environmental Mesonet"
    >
      <Layer
        id="hail-storm-radar-layer"
        type="raster"
        paint={{ 'raster-opacity': 0.6 }}
      />
    </Source>
  )
}

function formatStormSummary(event) {
  const parts = [event.date]
  if (event.hail_size_inches) parts.push(`${event.hail_size_inches}" hail`)
  if (event.distance_mi != null) parts.push(`${event.distance_mi} mi`)
  return parts.join(' · ')
}

function timelineProgress(frameIndex, frameCount) {
  if (!frameCount || frameCount <= 1) return 0
  return (frameIndex / (frameCount - 1)) * 100
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
    hasRadarData,
    isReportFrame,
  } = timeline ?? {}

  const radarOk = event?.year >= 1995
  const summary = formatStormSummary(event)
  const progressPct = timelineProgress(frameIndex, frameCount)
  const reportIdx = frames.findIndex((f) => f.offsetHours === 0)
  const reportMarkerPct =
    reportIdx >= 0 && frameCount > 1 ? timelineProgress(reportIdx, frameCount) : null

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
          <p className="hail-storm-summary" title={summary}>
            {summary}
          </p>
          <span className="hail-storm-panel-badge" aria-hidden>
            <CloudRain className="h-4 w-4" />
          </span>
        </header>

        {radarOk && canStep ? (
          <div className="hail-storm-panel-radar">
            <div className="hail-storm-panel-timeline" role="toolbar" aria-label="Storm radar timeline">
              <button
                type="button"
                className="hail-storm-step-btn"
                onClick={stepPrev}
                disabled={loading || !canPrev}
                title="One hour earlier"
                aria-label="Earlier radar frame"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="hail-storm-frame-info" aria-live="polite">
                {loading ? (
                  <span className="hail-storm-frame-loading">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
                title="One hour later"
                aria-label="Later radar frame"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {!loading && frameCount > 0 ? (
              <div
                className="hail-storm-progress"
                role="slider"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, frameCount - 1)}
                aria-valuenow={frameIndex}
                aria-label={`Radar timeline, ${isReportFrame ? 'at report time' : frameLabel}`}
              >
                <div className="hail-storm-progress-track">
                  <div
                    className="hail-storm-progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                  {reportMarkerPct != null ? (
                    <span
                      className="hail-storm-progress-report"
                      style={{ left: `${reportMarkerPct}%` }}
                      title="Hail report time"
                      aria-hidden
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
