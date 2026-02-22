import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/**
 * Component to render parcel boundaries from GeoJSON features
 * Enhanced with better styling and interactive features
 */
export function ParcelLayer({ features, onParcelClick }) {
  const map = useMap()

  useEffect(() => {
    if (!features || features.length === 0) {
      return
    }

    // Create a layer group for parcels
    const parcelLayer = L.layerGroup()

    // Default style for parcels
    const defaultStyle = {
      color: '#2563eb',      // Blue border
      weight: 2,
      opacity: 0.9,
      fillColor: '#3b82f6',   // Light blue fill
      fillOpacity: 0.15,
      dashArray: null
    }

    // Hover style
    const hoverStyle = {
      color: '#1d4ed8',      // Darker blue border
      weight: 3,
      opacity: 1.0,
      fillColor: '#60a5fa',   // Brighter blue fill
      fillOpacity: 0.3,
      dashArray: null
    }

    // Create GeoJSON layer with enhanced styling
    const geoJsonLayer = L.geoJSON(features, {
      style: defaultStyle,
      onEachFeature: (feature, layer) => {
        // Add click handler
        if (onParcelClick) {
          layer.on('click', (e) => {
            onParcelClick({
              latlng: e.latlng,
              properties: feature.properties,
              geometry: feature.geometry
            })
          })
        }

        // Enhanced hover effects
        layer.on('mouseover', function() {
          this.setStyle(hoverStyle)
          this.bringToFront()
        })

        layer.on('mouseout', function() {
          this.setStyle(defaultStyle)
        })
      }
    })

    parcelLayer.addLayer(geoJsonLayer)
    parcelLayer.addTo(map)

    // Cleanup
    return () => {
      map.removeLayer(parcelLayer)
    }
  }, [features, map, onParcelClick])

  return null
}

