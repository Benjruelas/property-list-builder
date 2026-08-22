/** Escape a parcel id for WFS Filter XML (CQL in a query string trips Cloudflare WAF). */
export function escapeWfsLiteral(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** WFS 2.0 GetFeature-by-lrid body. POST this so the filter never sits in the URL. */
export function wfsGetFeatureByLridXml(lrid) {
  const literal = escapeWfsLiteral(lrid)
  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json" count="1"
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:fes="http://www.opengis.net/fes/2.0">
  <wfs:Query typeNames="pro:parcel_us">
    <fes:Filter>
      <fes:PropertyIsEqualTo>
        <fes:ValueReference>lrid</fes:ValueReference>
        <fes:Literal>${literal}</fes:Literal>
      </fes:PropertyIsEqualTo>
    </fes:Filter>
  </wfs:Query>
</wfs:GetFeature>`
}

export function parseGeoJsonFeatureProperties(data) {
  if (!data || typeof data !== 'object' || data.error) return null
  const feature = data.features?.[0]
  return feature?.properties || null
}

export function parseGeoJsonFeatures(data) {
  if (!data || typeof data !== 'object' || data.error) return []
  return Array.isArray(data.features) ? data.features : []
}

/** WFS 2.0 BBOX body. POST so a huge GET query string doesn't hit Cloudflare WAF. */
export function wfsGetFeatureByBboxXml({ south, west, north, east, count = 200 }) {
  const s = Number(south)
  const w = Number(west)
  const n = Number(north)
  const e = Number(east)
  const c = Math.min(Math.max(parseInt(count, 10) || 200, 1), 400)
  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json" count="${c}"
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:fes="http://www.opengis.net/fes/2.0"
  xmlns:gml="http://www.opengis.net/gml/3.2">
  <wfs:Query typeNames="pro:parcel_us">
    <fes:Filter>
      <fes:BBOX>
        <gml:Envelope srsName="urn:ogc:def:crs:EPSG::4326">
          <gml:lowerCorner>${s} ${w}</gml:lowerCorner>
          <gml:upperCorner>${n} ${e}</gml:upperCorner>
        </gml:Envelope>
      </fes:BBOX>
    </fes:Filter>
  </wfs:Query>
</wfs:GetFeature>`
}

/** Compact mailing/homestead fields used to paint owner-occupied house icons. */
export function occupancyFromWfsProperties(props) {
  if (!props || typeof props !== 'object') return null
  const lrid = String(props.lrid || props.LRID || '').trim()
  if (!lrid) return null
  const owneraddr = props.owneraddr || props.OWNERADDR || ''
  const homestead = props.homestead_exemption ?? props.HOMESTEAD_EXEMPTION ?? ''
  return {
    lrid,
    owneraddr: owneraddr == null ? '' : String(owneraddr),
    homestead_exemption: homestead == null ? '' : String(homestead),
  }
}

export function occupancyMapFromWfsFeatures(features) {
  const out = {}
  for (const f of Array.isArray(features) ? features : []) {
    const occ = occupancyFromWfsProperties(f?.properties)
    if (occ) out[occ.lrid] = {
      owneraddr: occ.owneraddr,
      homestead_exemption: occ.homestead_exemption,
    }
  }
  return out
}
