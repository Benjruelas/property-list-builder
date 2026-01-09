/**
 * Vercel Serverless Function
 * Returns PMTiles URL for a specific county
 * 
 * Query parameters:
 * - county: County name (e.g., 'tarrant')
 */

export default async function handler(req, res) {
  // Set CORS headers - must be set before any response
  // These headers are also set in vercel.json, but we set them here too for safety
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.setHeader('Access-Control-Max-Age', '86400') // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get query parameters
    const { county } = req.query

    // Validate required parameters
    if (!county) {
      return res.status(400).json({ error: 'County parameter is required' })
    }

    // PMTiles URL pattern (public blob storage)
    const pmtilesUrl = `https://c26a6qe6znzs7fed.public.blob.vercel-storage.com/${county}-county.pmtiles`
    
    console.log(`Returning PMTiles URL for ${county} county: ${pmtilesUrl}`)

    // Return PMTiles URL
    return res.status(200).json({
      county: county,
      pmtilesUrl: pmtilesUrl,
      layerName: 'parcels'
    })

  } catch (error) {
    console.error('Error in parcels API:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}
