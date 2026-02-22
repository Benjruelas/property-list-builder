/**
 * Vercel Serverless Function
 * Polls BatchData API for skip trace job status and results
 * 
 * GET: Check job status and get results
 * Query: ?jobId=xxx
 * Returns: { status: 'completed'|'processing', results: [...] }
 * 
 * Documentation: https://developer.batchdata.com/docs/batchdata/
 * API Base URL: https://api.batchdata.com/api/v1 (using v1 instead of v3)
 * Authentication: Uses API token with Bearer format
 */

export default async function handler(req, res) {
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

    // BatchData API token
    const apiToken = process.env.BATCHDATA_API_KEY
    
    if (!apiToken) {
      console.error('❌ BATCHDATA_API_KEY not found in environment variables')
      return res.status(500).json({ error: 'Skip tracing service not configured' })
    }

    // Poll BatchData API for job status
    // Using v1 API instead of v3
    const BATCHDATA_API_BASE = process.env.BATCHDATA_API_BASE || 'https://api.batchdata.com/api/v1'
    
    // Get job status - check BatchData API docs for the correct status endpoint
    const statusEndpoint = process.env.BATCHDATA_STATUS_ENDPOINT || `${BATCHDATA_API_BASE}/property/skip-trace/${jobId}`
    console.log(`📡 Polling BatchData API: ${statusEndpoint}`)
    
    // Use API token directly in Authorization header
    // Based on BatchData example: Authorization: <YOUR_TOKEN> (no Bearer prefix)
    const authHeader = apiToken
    
    const statusResponse = await fetch(statusEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      console.error('❌ BatchData API error:', statusResponse.status, errorText)
      
      // If 404, job might not exist yet
      if (statusResponse.status === 404) {
        return res.status(200).json({
          status: 'processing',
          message: 'Job not found or still processing'
        })
      }
      
      return res.status(statusResponse.status).json({ error: 'Failed to fetch job status', details: errorText })
    }

    // Read response body as text first (can only be read once)
    const contentType = statusResponse.headers.get('content-type') || ''
    const isJSON = contentType.includes('application/json')
    const responseText = await statusResponse.text()
    
    console.log(`📄 Status response content-type: ${contentType}`)
    
    if (!isJSON) {
      console.error('❌ BatchData status API returned non-JSON response')
      console.error('Raw response:', responseText.substring(0, 500))
      return res.status(500).json({ 
        error: 'Invalid response format', 
        message: `Expected JSON but got ${contentType}` 
      })
    }
    
    let data
    try {
      data = JSON.parse(responseText)
    } catch (jsonError) {
      console.error('❌ Failed to parse status response as JSON:', jsonError)
      console.error('Raw response:', responseText.substring(0, 500))
      return res.status(500).json({ 
        error: 'Invalid JSON response', 
        message: jsonError.message 
      })
    }
    
    console.log(`📡 BatchData job ${jobId} response:`, {
      status: statusResponse.status,
      statusCode: data.status?.code,
      statusText: data.status?.text,
      hasResults: !!data.result?.data
    })
    
    // BatchData response format:
    // {
    //   "status": { "text": "string", "message": "string", "code": 0 },
    //   "result": {
    //     "data": [...],  // Array of results
    //     "meta": { "requestId": "string", ... }
    //   }
    // }
    
    // Check if job is completed
    const isCompleted = data.status?.code === 0 && data.result?.data && Array.isArray(data.result.data)
    
    if (isCompleted) {
      // Transform BatchData results to our format
      const results = (data.result.data || []).map((item) => {
        // Extract phones from persons array
        const phones = []
        if (item.persons && Array.isArray(item.persons)) {
          item.persons.forEach(person => {
            if (person.phones && Array.isArray(person.phones)) {
              person.phones.forEach(phone => {
                if (phone.number) {
                  phones.push(phone.number)
                }
              })
            }
          })
        }
        
        // Extract emails from persons array
        const emails = []
        if (item.persons && Array.isArray(item.persons)) {
          item.persons.forEach(person => {
            if (person.emails && Array.isArray(person.emails)) {
              person.emails.forEach(email => {
                if (email.email) {
                  emails.push(email.email)
                }
              })
            }
          })
        }
        
        // Extract address from input or property
        const address = item.input?.propertyAddress || item.property?.address
        const fullAddress = address?.fullAddress || 
          [address?.street, address?.city, address?.state, address?.zip]
            .filter(Boolean).join(', ') || null
        
        // Build input address for matching
        const inputAddr = item.input?.propertyAddress
        const inputAddressForMatching = [
          inputAddr?.street,
          inputAddr?.city,
          inputAddr?.state
        ].filter(Boolean).join(', ').toLowerCase().trim()
        
        return {
          phone: phones[0] || null,
          phoneNumbers: phones.filter((v, i, arr) => arr.indexOf(v) === i), // Remove duplicates
          email: emails[0] || null,
          emails: emails.filter((v, i, arr) => arr.indexOf(v) === i), // Remove duplicates
          address: fullAddress,
          inputAddress: inputAddressForMatching,
          inputAddressRaw: inputAddr?.street || '',
          inputCity: inputAddr?.city || '',
          inputState: inputAddr?.state || '',
          inputZip: inputAddr?.zip || ''
        }
      })
      
      console.log(`✅ Returning ${results.length} skip trace results for job ${jobId}`)
      
      return res.status(200).json({
        status: 'completed',
        results: results
      })
    }
    
    // Job is still processing or error
    if (data.status?.code !== 0) {
      console.log(`⚠️ BatchData job ${jobId} status: ${data.status?.text || 'processing'}`)
    }
    
    return res.status(200).json({
      status: 'processing',
      message: data.status?.message || data.status?.text || 'Job is still processing'
    })

  } catch (error) {
    console.error('❌ Skip trace status error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
