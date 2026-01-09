/**
 * Get county name from coordinates (approximate)
 * Adjust these boundaries based on your actual county data
 */
export const getCountyFromCoords = (lat, lng) => {
  // Texas county boundaries (approximate)
  // Tarrant County
  if (lat >= 32.5 && lat <= 33.1 && lng >= -97.4 && lng <= -97.0) {
    return 'tarrant'
  }
  // Dallas County
  if (lat >= 32.7 && lat <= 33.2 && lng >= -96.9 && lng <= -96.6) {
    return 'dallas'
  }
  // Denton County
  if (lat >= 33.0 && lat <= 33.5 && lng >= -97.2 && lng <= -96.9) {
    return 'denton'
  }
  // Johnson County
  if (lat >= 32.2 && lat < 32.5 && lng >= -97.5 && lng <= -97.1) {
    return 'johnson'
  }
  // Parker County
  if (lat >= 32.5 && lat <= 33.0 && lng >= -98.0 && lng <= -97.5) {
    return 'parker'
  }
  
  // Default to tarrant if unknown
  return 'tarrant'
}

/**
 * Calculate distance between two points in miles (Haversine formula)
 */
export const distanceInMiles = (lat1, lng1, lat2, lng2) => {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Check if a point is within a bounding box
 */
export const isPointInBounds = (lat, lng, bounds) => {
  return lat >= bounds.south && 
         lat <= bounds.north && 
         lng >= bounds.west && 
         lng <= bounds.east
}

