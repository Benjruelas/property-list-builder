/**
 * Skip tracing via SkipSherpa API. Disabled unless USE_SKIPSHERPA=true.
 * POST body: { parcels: [{ parcelId, address, ownerName }] }
 * Docs: https://skipsherpa.com/api/docs#/
 */

export default async function handler(req, res) {
  const USE_SKIPSHERPA = process.env.USE_SKIPSHERPA === 'true'
  if (!USE_SKIPSHERPA) {
    return res.status(503).json({ 
      error: 'SkipSherpa API is disabled.',
      message: 'Set USE_SKIPSHERPA=true to enable SkipSherpa'
    })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { parcels } = req.body

    if (!parcels || !Array.isArray(parcels) || parcels.length === 0) {
      return res.status(400).json({ error: 'Parcels array is required' })
    }

    const apiKey = process.env.SKIPSHERPA_API_KEY
    if (!apiKey) {
      console.error('SKIPSHERPA_API_KEY not found in environment variables')
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('SKIP') || k.includes('TRACE')).join(', ') || 'none')
      return res.status(500).json({ 
        error: 'Skip tracing service not configured',
        message: 'SKIPSHERPA_API_KEY environment variable is missing. For local dev, use "vercel dev" instead of "npm run dev"'
      })
    }

    // Parse names - split into first and last name
    const parseName = (nameStr) => {
      if (!nameStr || !nameStr.trim()) return { first: '', last: '' }
      const parts = nameStr.trim().split(/\s+/).filter(p => p.length > 0)
      if (parts.length === 0) return { first: '', last: '' }
      if (parts.length === 1) return { first: '', last: parts[0] }
      // Last part is typically last name, rest is first name
      const last = parts[parts.length - 1]
      const first = parts.slice(0, -1).join(' ')
      return { first, last }
    }

    // Parse addresses - SkipSherpa requires full address with city and state
    const parseAddress = (addressStr) => {
      if (!addressStr || !addressStr.trim()) return null
      
      const parts = addressStr.split(',').map(p => p.trim()).filter(p => p.length > 0)
      let street = addressStr
      let city = ''
      let state = 'TX' // Default to Texas
      let zip = ''
      
      if (parts.length >= 3) {
        // Format: "123 Main St, City, TX 12345" or "123 Main St, City, TX"
        street = parts[0]
        city = parts[1]
        const lastPart = parts[parts.length - 1]
        // Try to extract state and zip from last part
        const stateZipMatch = lastPart.match(/^([A-Z]{2})(\s+(\d{5}(?:-\d{4})?))?$/)
        if (stateZipMatch) {
          state = stateZipMatch[1]
          zip = stateZipMatch[3] || ''
        } else {
          // If no match, check if it looks like a state code
          if (/^[A-Z]{2}$/.test(lastPart.toUpperCase())) {
            state = lastPart.toUpperCase()
          }
        }
      } else if (parts.length === 2) {
        // Format: "123 Main St, City" or "123 Main St, TX"
        street = parts[0]
        const secondPart = parts[1]
        // Check if second part is a state (2 letters) or city
        if (/^[A-Z]{2}$/.test(secondPart.toUpperCase())) {
          state = secondPart.toUpperCase()
          city = 'Fort Worth' // Default city
        } else {
          city = secondPart
          state = 'TX' // Default to Texas
        }
      } else {
        // Just street address - no city/state, use defaults
        street = parts[0]
        city = 'Fort Worth' // Default city
        state = 'TX' // Default state (Texas)
      }
      
      // Ensure we have city and state
      if (!city) city = 'Fort Worth'
      if (!state) state = 'TX'
      
      return { street, city, state, zip }
    }

    // Build SkipSherpa API request payload
    // SkipSherpa expects an array of records with address, city, state, zip, firstName, lastName
    const records = parcels.map(p => {
      const address = (p.address || '').trim()
      const ownerName = (p.ownerName || '').trim()
      
      if (!address) return null // Address is required
      
      const addr = parseAddress(address)
      if (!addr) return null
      
      const name = parseName(ownerName)
      // SkipSherpa may require owner name - use placeholder if empty
      if (!name.last) {
        name.last = 'Unknown'
      }
      
      return {
        address: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip || undefined, // Skip if empty
        firstName: name.first || undefined,
        lastName: name.last || 'Unknown'
      }
    }).filter(Boolean)

    if (records.length === 0) {
      return res.status(400).json({ error: 'No valid addresses found' })
    }

    const SKIPSHERPA_API_BASE = process.env.SKIPSHERPA_API_BASE || 'https://skipsherpa.com'
    const endpoint = process.env.SKIPSHERPA_ENDPOINT || `${SKIPSHERPA_API_BASE}/api/v1/property-lookup`
    
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: records
        })
      })
    } catch (fetchError) {
      console.error('Fetch error calling SkipSherpa API:', fetchError)
      throw new Error(`Failed to connect to SkipSherpa API: ${fetchError.message}`)
    }


    if (!response.ok) {
      const errorText = await response.text()
      console.error('SkipSherpa API error:', response.status, errorText)
      
      // For 429 rate limit errors
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.', details: errorText })
      }
      
      return res.status(response.status).json({ error: 'Skip tracing failed', details: errorText })
    }

    let result
    try {
      result = await response.json()
    } catch (jsonError) {
      console.error('Failed to parse SkipSherpa API response as JSON:', jsonError)
      const textResponse = await response.text()
      console.error('Raw response:', textResponse)
      throw new Error(`Invalid JSON response from SkipSherpa API: ${jsonError.message}`)
    }
    
    // SkipSherpa may return a job ID or direct results
    // Adjust based on actual API response structure
    const jobId = result.jobId || result.id || result.job_id || result.request_id
    
    if (!jobId && !result.results) {
      return res.status(500).json({ error: 'No job ID or results returned from skip tracing service', details: result })
    }

    // If results are returned directly (synchronous)
    if (result.results) {
      return res.status(200).json({
        success: true,
        jobId: jobId || 'sync',
        async: false,
        message: 'Skip tracing completed',
        status: 'completed',
        results: result.results
      })
    }

    // If job ID is returned (asynchronous)
    return res.status(200).json({
      success: true,
      jobId: jobId,
      async: true,
      message: 'Skip tracing job submitted successfully',
      status: result.status || 'pending'
    })

  } catch (error) {
    console.error('Skip trace error:', error)
    console.error('Error stack:', error.stack)
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
