import { Source, Layer } from 'react-map-gl/maplibre'
import { ArrowLeft, ChevronLeft, ChevronRight, CloudRain, Loader2 } from 'lucide-react'
import { Button } from './ui/button'

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

/** Floating dismiss pill + radar timeline — render outside MapGL, over the map. */
export function HailStormDismissPill({
  event,
  onDismiss,
  timeline,
}) {
  if (!event) return null

  const {
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
  const sizeStr = event.hail_size_inches ? ` · ${event.hail_size_inches}"` : ''
  const distStr = event.distance_mi != null ? ` · ${event.distance_mi} mi` : ''

  return (
    <div className="hail-storm-dismiss-wrap">
      <Button
        variant="outline"
        onClick={onDismiss}
        className="hail-storm-dismiss-btn"
        title="Back to Hail Data"
        aria-label="Back to Hail Data"
      >
        <ArrowLeft className="h-4 w-4" />
        <CloudRain className="h-4 w-4" />
        <span>{event.date}{sizeStr}{distStr}</span>
      </Button>

      {radarOk && canStep && (
        <div className="hail-storm-timeline" role="toolbar" aria-label="Storm radar timeline">
          <button
            type="button"
            className="hail-storm-timeline-btn"
            onClick={stepPrev}
            disabled={loading || !canPrev}
            title="One hour earlier"
            aria-label="Earlier radar frame"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="hail-storm-timeline-label" aria-live="polite">
            {loading ? (
              <span className="hail-storm-timeline-loading">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading radar…
              </span>
            ) : (
              <>
                <span className="hail-storm-timeline-time">{frameLabel}</span>
                <span className="hail-storm-timeline-count">
                  {frameIndex + 1} / {frameCount}
                  {!isReportFrame && ' · hourly ±8h'}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            className="hail-storm-timeline-btn"
            onClick={stepNext}
            disabled={loading || !canNext}
            title="One hour later"
            aria-label="Later radar frame"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!radarOk && (
        <div className="hail-storm-dismiss-note">Radar unavailable before 1995</div>
      )}
      {radarOk && !loading && !hasRadarData && (
        <div className="hail-storm-dismiss-note">No radar data for this time</div>
      )}
    </div>
  )
}
