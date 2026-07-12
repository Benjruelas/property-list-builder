/**
 * Helpers for NOAA/SPC hail report lists shown in Hail Data.
 * Same calendar date can include multiple nearby reports (different size/location/time).
 */

export function compareHailEventsNewestFirst(a, b) {
  const dateCmp = String(b?.date || '').localeCompare(String(a?.date || ''))
  if (dateCmp !== 0) return dateCmp
  const sizeCmp = (b?.hail_size_inches || 0) - (a?.hail_size_inches || 0)
  if (sizeCmp !== 0) return sizeCmp
  const distA = a?.distance_mi
  const distB = b?.distance_mi
  if (distA == null && distB == null) return 0
  if (distA == null) return 1
  if (distB == null) return -1
  return distA - distB
}

export function summarizeStormDay(events) {
  const list = Array.isArray(events) ? events.filter(Boolean) : []
  if (!list.length) {
    return {
      date: null,
      report_count: 0,
      max_hail_size_inches: 0,
      closest_distance_mi: null,
      reports: [],
    }
  }

  const reports = [...list].sort(compareHailEventsNewestFirst)
  let maxSize = 0
  let closest = null
  for (const evt of reports) {
    maxSize = Math.max(maxSize, evt.hail_size_inches || 0)
    if (evt.distance_mi != null && (closest == null || evt.distance_mi < closest)) {
      closest = evt.distance_mi
    }
  }

  return {
    date: reports[0].date || null,
    report_count: reports.length,
    max_hail_size_inches: maxSize,
    closest_distance_mi: closest,
    reports,
  }
}

/** Group hail reports by calendar date (newest day first). */
export function groupHailEventsByDate(events) {
  if (!Array.isArray(events) || events.length === 0) return []

  const byDate = new Map()
  for (const evt of events) {
    const date = evt?.date || 'unknown'
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(evt)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .map(([, dayEvents]) => summarizeStormDay(dayEvents))
}
