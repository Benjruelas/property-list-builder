import { mapProperties } from './parcelPropertyMap'
import { computeOwnerOccupied } from './ownerOccupied'

/** Leading house number from situs; skips assessor placeholders like "0" / "00". */
export function extractHouseNumber(addr) {
  if (!addr) return ''
  const trimmed = String(addr).trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(\d{1,5}[A-Za-z]?)\b/)
  if (!match) return ''
  const num = match[1]
  const digits = num.replace(/[A-Za-z]/g, '')
  if (!digits || /^0+$/.test(digits)) return ''
  return num
}

export const MAX_LABEL_FEATURES = 500

function occupancyCode(ooStatus) {
  if (ooStatus === 'Yes') return 1
  if (ooStatus === 'No') return 0
  return -1
}

/**
 * House-number labels + owner-occupied icon code.
 * `occupancyByLrid` supplies mailing/homestead from WFS (tiles lack them).
 */
export function buildLabelGeoJSON(features, occupancyByLrid = new Map()) {
  const seen = new Set()
  const pts = []
  for (const f of features) {
    if (pts.length >= MAX_LABEL_FEATURES) break
    const p = f.properties || {}
    const id = p.lrid || p.parcelid
    if (!id || seen.has(id)) continue
    const cx = Number(p.centroidx)
    const cy = Number(p.centroidy)
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) continue
    const num = extractHouseNumber(p.parceladdr)
    if (!num) continue
    seen.add(id)
    const extra = occupancyByLrid.get(String(id)) || occupancyByLrid.get(id) || {}
    const mapped = mapProperties({
      ...p,
      owneraddr: extra.owneraddr || p.owneraddr,
      homestead_exemption: extra.homestead_exemption ?? p.homestead_exemption,
    })
    // Only color OO when we also emit a house number (same feature / gate).
    // 1 = Yes, 0 = No, -1 = unknown (no home icon).
    const oo = occupancyCode(computeOwnerOccupied(mapped))
    pts.push({
      type: 'Feature',
      // New identity when occupancy resolves so MapLibre re-places the home icon
      // immediately instead of waiting for the next zoom layout pass.
      id: `${id}:${oo}`,
      geometry: { type: 'Point', coordinates: [cx, cy] },
      properties: { _label: num, _oo: oo, _lrid: String(id) },
    })
  }
  return { type: 'FeatureCollection', features: pts }
}

/** Counts of Yes / No / unknown occupancy codes currently on the label source. */
export function labelOccupancyFingerprint(geo) {
  let yes = 0
  let no = 0
  let unknown = 0
  for (const f of geo.features || []) {
    const oo = f.properties?._oo
    if (oo === 1) yes += 1
    else if (oo === 0) no += 1
    else unknown += 1
  }
  return `${yes}:${no}:${unknown}`
}

export function labelGeoJSONKey(geo) {
  const feats = geo.features
  if (!feats.length) return 'empty'
  const first = feats[0]
  const last = feats[feats.length - 1]
  return [
    feats.length,
    labelOccupancyFingerprint(geo),
    first.properties?._label,
    last.properties?._label,
    first.geometry?.coordinates?.[0],
    first.geometry?.coordinates?.[1],
    last.geometry?.coordinates?.[0],
  ].join('|')
}

export function labelLridsMissingOccupancy(geo, occupancyByLrid) {
  const missing = []
  for (const f of geo.features || []) {
    const id = f.properties?._lrid
    if (!id) continue
    if (!occupancyByLrid.has(id)) missing.push(id)
  }
  return missing
}
