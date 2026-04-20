let cachedSession = null
let cachedExpiry = 0

export default async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_TILES_KEY || process.env.GOOGLE_SOLAR_API_KEY
  if (!key) {
    return res.status(404).json({ error: 'GOOGLE_MAPS_TILES_KEY not configured' })
  }

  if (cachedSession && Date.now() < cachedExpiry - 60_000) {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({
      tileUrl: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${cachedSession}&key=${key}`,
      expiry: cachedExpiry,
    })
  }

  try {
    const resp = await fetch(`https://tile.googleapis.com/v1/createSession?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mapType: 'satellite',
        language: 'en-US',
        region: 'US',
        scale: 'scaleFactor2x',
        highDpi: true,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('Google Map Tiles session error:', resp.status, errText)
      return res.status(502).json({ error: `Google API error: ${resp.status}` })
    }

    const data = await resp.json()
    cachedSession = data.session
    cachedExpiry = new Date(data.expiry).getTime()

    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json({
      tileUrl: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${key}`,
      expiry: cachedExpiry,
    })
  } catch (e) {
    console.error('Google Map Tiles session error:', e)
    return res.status(500).json({ error: e.message || 'Internal server error' })
  }
}
