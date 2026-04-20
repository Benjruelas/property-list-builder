/**
 * Poll SkipSherpa API for skip-trace job status. Disabled unless USE_SKIPSHERPA=true.
 * GET ?jobId=xxx → { status: 'completed'|'processing', results: [...] }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId } = req.query

    if (!jobId) {
      return res.status(400).json({ error: 'jobId query parameter is required' })
    }

    const apiKey = process.env.SKIPSHERPA_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Skip tracing service not configured' })
    }

    const SKIPSHERPA_API_BASE = process.env.SKIPSHERPA_API_BASE || 'https://skipsherpa.com'
    const statusEndpoint = process.env.SKIPSHERPA_STATUS_ENDPOINT || `${SKIPSHERPA_API_BASE}/api/v1/skip-trace/${jobId}`
    const statusResponse = await fetch(statusEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      console.error('SkipSherpa API error:', statusResponse.status, errorText)
      
      // If 404, job might not exist yet
      if (statusResponse.status === 404) {
        return res.status(200).json({
          status: 'processing',
          message: 'Job not found or still processing'
        })
      }
      
      return res.status(statusResponse.status).json({ error: 'Failed to fetch job status', details: errorText })
    }

    const data = await statusResponse.json()
    
    
    // Parse SkipSherpa response format
    // Adjust based on actual API response structure
    if (data.status === 'completed' || data.completed || data.results) {
      // Transform SkipSherpa results to our format
      const results = (data.results || []).map((row) => {
        // Extract phone numbers - adjust field names based on actual API
        const phones = [
          row.phone,
          row.phoneNumber,
          row.mobile,
          row.mobilePhone,
          row.primaryPhone,
          row.cellPhone,
          row.landline
        ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
        
        // Extract emails - adjust field names based on actual API
        const emails = [
          row.email,
          row.emailAddress,
          row.primaryEmail
        ].filter(Boolean)
        
        // Extract address
        const address = row.address || row.mailingAddress || null
        const city = row.city || ''
        const state = row.state || ''
        const zip = row.zip || row.zipCode || ''
        const fullAddress = [address, city, state, zip].filter(Boolean).join(', ') || null
        
        // Extract input address for matching
        const inputAddress = (row.inputAddress || row.address || '').trim()
        const inputCity = (row.inputCity || row.city || '').trim()
        const inputState = (row.inputState || row.state || '').trim()
        const inputZip = (row.inputZip || row.zip || '').trim()
        
        // Build normalized input address for matching
        const inputAddressForMatching = [
          inputAddress,
          inputCity,
          inputState
        ].filter(Boolean).join(', ').toLowerCase().trim()
        
        return {
          phone: phones[0] || null,
          phoneNumbers: phones,
          email: emails[0] || null,
          emails: emails,
          address: fullAddress,
          // Include input address fields for matching
          inputAddress: inputAddressForMatching,
          inputAddressRaw: inputAddress,
          inputCity: inputCity,
          inputState: inputState,
          inputZip: inputZip
        }
      })
      
      
      return res.status(200).json({
        status: 'completed',
        results: results
      })
    }
    
    // Job is still processing
    return res.status(200).json({
      status: 'processing',
      message: 'Job is still processing'
    })

  } catch (error) {
    console.error('Skip trace status error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
