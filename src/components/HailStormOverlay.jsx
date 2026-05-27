import { useEffect, useState } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import { ArrowLeft, CloudRain } from 'lucide-react'
import { Button } from './ui/button'
import { radarAvailableForEvent, resolveRadarTileUrl } from '../utils/nexradOverlay'

export function HailStormOverlay({ event }) {
  const [tileUrl, setTileUrl] = useState(null)

  useEffect(() => {
    if (!event || !radarAvailableForEvent(event)) {
      setTileUrl(null)
      return
    }
    let cancelled = false
    resolveRadarTileUrl(event).then((url) => {
      if (!cancelled) setTileUrl(url)
    })
    return () => { cancelled = true }
  }, [event])

  if (!event || !tileUrl) return null

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

/** Floating dismiss pill — render outside MapGL, positioned over the map. */
export function HailStormDismissPill({ event, onDismiss }) {
  if (!event) return null
  const radarOk = radarAvailableForEvent(event)
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
      {!radarOk && (
        <div className="hail-storm-dismiss-note">Radar unavailable before 1995</div>
      )}
    </div>
  )
}
