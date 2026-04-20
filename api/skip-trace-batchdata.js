/**
 * Skip tracing via BatchData API (v1).
 * POST body: { parcels: [{ parcelId, address, ownerName }] }
 * Docs: https://developer.batchdata.com/docs/batchdata/
 */

export default async function handler(req, res) {
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

    const apiToken = process.env.BATCHDATA_API_KEY

    if (!apiToken) {
      console.error('BATCHDATA_API_KEY not found in environment variables')
      return res.status(500).json({
        error: 'Skip tracing service not configured',
        message: 'BATCHDATA_API_KEY environment variable is missing. For local dev, use "vercel dev" instead of "npm run dev"'
      })
    }

    // Parse addresses - BatchData requires full address with city, state, and zip
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

    // Build BatchData API request payload
    // Format: { "requests": [{ "propertyAddress": { "street", "city", "state", "zip" } }] }
    const requests = parcels.map(p => {
      const address = (p.address || '').trim()
      
      if (!address) return null // Address is required
      
      const addr = parseAddress(address)
      if (!addr) return null
      
      return {
        propertyAddress: {
          street: addr.street,
          city: addr.city,
          state: addr.state,
          zip: addr.zip || '' // Use empty string if no zip
        }
      }
    }).filter(Boolean)

    if (requests.length === 0) {
      return res.status(400).json({ error: 'No valid addresses found' })
    }

    const BATCHDATA_API_BASE = process.env.BATCHDATA_API_BASE || 'https://api.batchdata.com/api/v1'
    // Single parcel: synchronous endpoint. Multiple parcels: async endpoint (returns job ID).
    const isSingleParcel = requests.length === 1
    const endpoint = isSingleParcel
      ? `${BATCHDATA_API_BASE}/property/skip-trace`
      : `${BATCHDATA_API_BASE}/property/skip-trace/async`

    const authHeader = `Bearer ${apiToken.trim()}`

    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({ requests }),
        redirect: 'manual'
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        console.error(`BatchData API returned redirect (${response.status}) to: ${location}`)
        console.error('This suggests the endpoint URL might be incorrect')
        console.error(`Tried endpoint: ${endpoint}`)
        return res.status(500).json({
          error: 'API endpoint returned redirect',
          message: `BatchData API redirected to: ${location}`,
          endpoint: endpoint
        })
      }
    } catch (fetchError) {
      console.error('Fetch error calling BatchData API:', fetchError)
      throw new Error(`Failed to connect to BatchData API: ${fetchError.message}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const isJSON = contentType.includes('application/json')
    const responseText = await response.text()

    if (!response.ok) {
      console.error('BatchData API error:', response.status, responseText.substring(0, 500))
      console.error('Request endpoint:', endpoint)
      console.error('Request headers:', {
        'Authorization': authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING',
        'Content-Type': 'application/json'
      })
      
      let errorDetails = responseText
      if (isJSON) {
        try {
          const errorJson = JSON.parse(responseText)
          errorDetails = errorJson
          console.error('BatchData API error details:', JSON.stringify(errorJson, null, 2))
        } catch {
          // not valid JSON despite content-type
        }
      }

      if (response.status === 401) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid API token or authentication method. Please check your BATCHDATA_API_KEY.',
          details: errorDetails
        })
      }

      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.', details: errorDetails })
      }

      return res.status(response.status).json({ error: 'Skip tracing failed', details: errorDetails })
    }

    let result
    if (isJSON) {
      try {
        result = JSON.parse(responseText)
      } catch (jsonError) {
        console.error('Failed to parse BatchData API response as JSON:', jsonError)
        console.error('Raw response:', responseText.substring(0, 500))
        throw new Error(`Invalid JSON response from BatchData API: ${jsonError.message}`)
      }
    } else {
      console.error('BatchData API returned non-JSON response (HTML?)')
      console.error('Raw response:', responseText.substring(0, 500))
      throw new Error(`BatchData API returned unexpected content type: ${contentType}. Response appears to be HTML, not JSON.`)
    }

    if (result.status && result.status.code !== 200 && result.status.code !== 0) {
      console.error('BatchData API returned error status:', result.status)
      return res.status(400).json({
        error: 'BatchData API error',
        message: result.status.message || result.status.text || 'Unknown error',
        code: result.status.code,
        details: result
      })
    }
    
    // Synchronous single-parcel path: response is the full result.
    if (isSingleParcel) {
      const personsArray = result.results?.persons || []

      if (personsArray.length === 0) {
        return res.status(200).json({
          success: true,
          jobId: 'sync',
          async: false,
          message: 'Skip tracing completed (no contact info found)',
          status: 'completed',
          results: []
        })
      }
      
      // v1 response: result.results.persons[] with { phoneNumbers[], emails[], propertyAddress }
      const transformedResults = personsArray.map((person, personIndex) => {
        const phones = []
        if (person.phoneNumbers && Array.isArray(person.phoneNumbers)) {
          person.phoneNumbers.forEach((phoneObj, idx) => {
            const phoneNumber = phoneObj?.number
            if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
              phones.push(phoneNumber.trim())
            } else {
              console.warn(`Phone ${idx} in person ${personIndex} has unexpected format:`, phoneObj)
            }
          })
        } else if (person.phones && Array.isArray(person.phones)) {
          person.phones.forEach((phone, idx) => {
            const phoneNumber = phone?.number || phone?.phone || phone?.phoneNumber || phone
            if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
              phones.push(phoneNumber.trim())
            } else {
              console.warn(`Phone ${idx} in person ${personIndex} has unexpected format:`, phone)
            }
          })
        } else if (person.phone) {
          phones.push(person.phone)
        }

        const emails = []
        if (person.emails && Array.isArray(person.emails)) {
          person.emails.forEach(email => {
            const emailAddress = email?.email || email
            if (emailAddress && typeof emailAddress === 'string' && emailAddress.trim()) {
              emails.push(emailAddress.trim())
            }
          })
        } else if (person.email) {
          emails.push(person.email)
        }

        const propertyAddr = person.propertyAddress
        const addressObj = propertyAddr || (person.addresses && person.addresses[0]) || null
        const fullAddress = addressObj?.fullAddress ||
          [addressObj?.street, addressObj?.city, addressObj?.state, addressObj?.zip]
            .filter(Boolean).join(', ') || null

        const inputAddr = propertyAddr
        const inputAddressForMatching = [
          inputAddr?.street,
          inputAddr?.city,
          inputAddr?.state
        ].filter(Boolean).join(', ').toLowerCase().trim()

        return {
          phone: phones[0] || null,
          phoneNumbers: phones.filter((v, i, arr) => arr.indexOf(v) === i),
          email: emails[0] || null,
          emails: emails.filter((v, i, arr) => arr.indexOf(v) === i),
          address: fullAddress,
          inputAddress: inputAddressForMatching,
          inputAddressRaw: inputAddr?.street || '',
          inputCity: inputAddr?.city || '',
          inputState: inputAddr?.state || '',
          inputZip: inputAddr?.zip || ''
        }
      })

      return res.status(200).json({
        success: true,
        jobId: 'sync',
        async: false,
        message: 'Skip tracing completed',
        status: 'completed',
        results: transformedResults
      })
    }
    
    // Async multi-parcel path: response is a job ID under a handful of possible keys.
    const jobId = result.result?.meta?.requestId ||
                  result.meta?.requestId ||
                  result.jobId ||
                  result.id ||
                  result.job_id ||
                  result.request_id ||
                  result.batch_id
    
    if (!jobId) {
      console.error('No job ID found in response')
      console.error('Response structure:', {
        hasResult: !!result.result,
        hasMeta: !!result.result?.meta,
        hasRequestId: !!result.result?.meta?.requestId,
        fullResult: JSON.stringify(result, null, 2).substring(0, 1000)
      })
      return res.status(500).json({ error: 'No job ID returned from skip tracing service', details: result })
    }


    return res.status(200).json({
      success: true,
      jobId: jobId,
      async: true,
      message: 'Skip tracing job submitted successfully',
      status: result.status?.text || result.status || 'pending'
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
