/**
 * GPS path smoothing utilities.
 *
 * - Kalman filter: real-time noise reduction during recording
 * - Ramer-Douglas-Peucker: simplify point count
 * - Chaikin corner-cutting: produce visually smooth curves
 */

// ---------------------------------------------------------------------------
// Kalman filter for 2-D GPS coordinates
// ---------------------------------------------------------------------------

export function createKalmanFilter() {
  let lat = null
  let lng = null
  let variance = -1 // negative means uninitialized
  let lastTime = 0

  // Process noise per second — prevents variance from collapsing to near-zero
  // which would make the filter ignore new measurements at higher speeds.
  const Q_PER_SEC = 3

  return {
    update(measuredLat, measuredLng, accuracy) {
      const measurementVariance = accuracy * accuracy
      const now = Date.now()

      if (variance < 0) {
        lat = measuredLat
        lng = measuredLng
        variance = measurementVariance
        lastTime = now
      } else {
        const dt = Math.max(0, (now - lastTime) / 1000)
        lastTime = now
        // Grow variance over time so the filter stays responsive
        variance += Q_PER_SEC * dt

        const k = variance / (variance + measurementVariance)
        lat = lat + k * (measuredLat - lat)
        lng = lng + k * (measuredLng - lng)
        variance = (1 - k) * variance
      }

      return { lat, lng }
    },

    reset() {
      lat = null
      lng = null
      variance = -1
      lastTime = 0
    }
  }
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker simplification
// ---------------------------------------------------------------------------

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.lng - lineStart.lng
  const dy = lineEnd.lat - lineStart.lat

  if (dx === 0 && dy === 0) {
    const dlat = point.lat - lineStart.lat
    const dlng = point.lng - lineStart.lng
    return Math.sqrt(dlat * dlat + dlng * dlng)
  }

  const t = Math.max(0, Math.min(1,
    ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy)
  ))

  const projLng = lineStart.lng + t * dx
  const projLat = lineStart.lat + t * dy
  const dlat = point.lat - projLat
  const dlng = point.lng - projLng
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const end = points.length - 1

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end])
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(points.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }

  return [points[0], points[end]]
}

// ---------------------------------------------------------------------------
// Chaikin corner-cutting (produces smoother curves)
// ---------------------------------------------------------------------------

function chaikinSmooth(points, iterations = 2) {
  if (points.length < 3) return points

  let current = points
  for (let iter = 0; iter < iterations; iter++) {
    const next = [current[0]]
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i]
      const p1 = current[i + 1]
      next.push({
        lat: 0.75 * p0.lat + 0.25 * p1.lat,
        lng: 0.75 * p0.lng + 0.25 * p1.lng
      })
      next.push({
        lat: 0.25 * p0.lat + 0.75 * p1.lat,
        lng: 0.25 * p0.lng + 0.75 * p1.lng
      })
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}

// ---------------------------------------------------------------------------
// Combined pipeline: simplify then smooth
// ---------------------------------------------------------------------------

const RDP_EPSILON = 0.00003 // ~3 m at mid-latitudes

const SMOOTHING_PRESETS = {
  off:     { rdp: false, chaikin: 0 },
  light:   { rdp: true,  chaikin: 0 },
  normal:  { rdp: true,  chaikin: 2 },
  heavy:   { rdp: true,  chaikin: 4 },
}

export function smoothPath(points, level = 'normal') {
  if (!points || points.length < 2) return points || []
  const preset = SMOOTHING_PRESETS[level] || SMOOTHING_PRESETS.normal
  let result = points
  if (preset.rdp) result = rdpSimplify(result, RDP_EPSILON)
  if (preset.chaikin > 0) result = chaikinSmooth(result, preset.chaikin)
  return result
}

// ---------------------------------------------------------------------------
// Distance calculation (Haversine)
// ---------------------------------------------------------------------------

function haversineTotal(points, radiusFactor) {
  if (!points || points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const dLat = (points[i].lat - points[i - 1].lat) * Math.PI / 180
    const dLng = (points[i].lng - points[i - 1].lng) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(points[i - 1].lat * Math.PI / 180) *
      Math.cos(points[i].lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    total += radiusFactor * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return Math.round(total * 100) / 100
}

export function totalDistanceMiles(points) {
  return haversineTotal(points, 3959)
}

export function totalDistanceKm(points) {
  return haversineTotal(points, 6371)
}
