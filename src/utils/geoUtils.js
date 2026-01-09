/**
 * Get county name from coordinates
 * Boundaries extracted from actual GeoJSON bounding boxes
 * Check order matters due to overlaps - check more specific/unique counties first
 */
export const getCountyFromCoords = (lat, lng) => {
  // Boundaries from actual GeoJSON files:
  // Parker: lat [32.5505, 33.0117], lng [-98.0686, -97.5375]
  // Dallas: lat [32.5450, 32.9897], lng [-97.0387, -96.5170]
  // Tarrant: lat [32.5484, 32.9940], lng [-97.5530, -97.0311]
  // Johnson: lat [32.1342, 32.5621], lng [-97.6452, -97.0775]
  // Ellis: lat [32.0521, 32.5490], lng [-97.0871, -96.3830]
  
  // Use tighter boundaries with priority order to handle overlaps
  
  // 1. Parker County (clearly west, lng < -97.5)
  // lat [32.5505, 33.0117], lng [-98.0686, -97.5375]
  if (lng < -97.5 && lat >= 32.55 && lat <= 33.02) {
    return 'parker'
  }
  
  // 2. Dallas County (clearly east, lng > -97.0)
  // lat [32.5450, 32.9897], lng [-97.0387, -96.5170]
  if (lng > -97.0 && lat >= 32.54 && lat <= 32.99) {
    return 'dallas'
  }
  
  // 3. Johnson County (southern, west of Tarrant)
  // lat [32.1342, 32.5621], lng [-97.6452, -97.0775]
  if (lat < 32.56 && lng < -97.1 && lng >= -97.65) {
    return 'johnson'
  }
  
  // 4. Ellis County (southern, east of Tarrant)
  // lat [32.0521, 32.5490], lng [-97.0871, -96.3830]
  if (lat < 32.55 && lng > -97.1 && lng <= -96.38) {
    return 'ellis'
  }
  
  // 5. Tarrant County (central area between others - check last)
  // lat [32.5484, 32.9940], lng [-97.5530, -97.0311]
  // This is in the middle, overlaps with Dallas/Parker boundaries
  if (lat >= 32.54 && lat <= 32.99 && lng >= -97.56 && lng <= -97.03) {
    return 'tarrant'
  }
  
  // 6. Denton County (estimated - north of Tarrant/Dallas)
  // Rough estimate: lat > 33.0, lng -97.2 to -96.9
  if (lat > 32.99 && lat <= 33.5 && lng >= -97.2 && lng <= -96.9) {
    return 'denton'
  }
  
  // Default to tarrant if unknown (most common area)
  console.warn(`County not detected for coordinates: lat=${lat}, lng=${lng}, defaulting to tarrant`)
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



