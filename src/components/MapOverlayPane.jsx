import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'

const OVERLAY_PANE_NAME = 'appOverlayPane'

/**
 * Creates a high z-index pane inside Leaflet's norotatePane and portals
 * children into it. This ensures overlays (e.g. ParcelDetails) render above
 * parcel boundaries when using leaflet-rotate.
 */
export function MapOverlayPane({ children, hasContent }) {
  const map = useMap()
  const [pane, setPane] = useState(null)

  useEffect(() => {
    if (!map) return

    // Use existing pane if already created
    let targetPane = map.getPane(OVERLAY_PANE_NAME)
    if (!targetPane) {
      const norotatePane = map.getPane('norotatePane')
      const container = norotatePane || map.getPane('mapPane')
      targetPane = map.createPane(OVERLAY_PANE_NAME, container)
      if (targetPane) {
        targetPane.style.zIndex = '9999'
      }
    }
    if (targetPane) {
      targetPane.style.pointerEvents = hasContent ? 'auto' : 'none'
      setPane(targetPane)
    }

    return () => setPane(null)
  }, [map, hasContent])

  if (!pane) return null

  return createPortal(children, pane)
}
