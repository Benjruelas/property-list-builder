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
