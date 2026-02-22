/**
 * Vercel Serverless Function
 * Handles skip tracing via BatchData API
 * 
 * POST: Skip trace one or more parcels
 * Body: { parcels: [{ parcelId, address, ownerName }] }
 * 
 * Documentation: https://developer.batchdata.com/docs/batchdata/
 * API Base URL: https://api.batchdata.com/api/v1 (using v1 instead of v3)
 * Authentication: Uses API token with Bearer format
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

    // BatchData API token - must match example exactly: Authorization: <YOUR_TOKEN>
    // Use the token from .env.local: Xhelik8Fxu7W8ZDeJmGbxrLYMrQOU4hAueLKWobK
    const apiToken = process.env.BATCHDATA_API_KEY
    
    if (!apiToken) {
      console.error('❌ BATCHDATA_API_KEY not found in environment variables')
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('BATCH')).join(', ') || 'none')
      return res.status(500).json({ 
        error: 'Skip tracing service not configured',
        message: 'BATCHDATA_API_KEY environment variable is missing. For local dev, use "vercel dev" instead of "npm run dev"'
      })
    }
    
    // Log token info for debugging (first 10 chars only for security)
    console.log(`🔐 API Token loaded: ${apiToken.substring(0, 10)}... (length: ${apiToken.length})`)
    
    // Verify we're using the correct token (should start with Xhelik)
    if (!apiToken.startsWith('Xhelik')) {
      console.warn(`⚠️ WARNING: API token doesn't start with 'Xhelik'. Current token starts with: ${apiToken.substring(0, 10)}`)
      console.warn('⚠️ Make sure BATCHDATA_API_KEY in .env.local is set to: Xhelik8Fxu7W8ZDeJmGbxrLYMrQOU4hAueLKWobK')
      console.warn('⚠️ Restart "vercel dev" after updating .env.local')
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

    // Submit to BatchData API
    // Using v1 API instead of v3
    const BATCHDATA_API_BASE = process.env.BATCHDATA_API_BASE || 'https://api.batchdata.com/api/v1'
    
    // BatchData API v1 endpoints:
    // - Single parcel (synchronous): /property/skip-trace
    // - Multiple parcels (asynchronous): /property/skip-trace/async
    const isSingleParcel = requests.length === 1
    const endpoint = isSingleParcel
      ? `${BATCHDATA_API_BASE}/property/skip-trace`
      : `${BATCHDATA_API_BASE}/property/skip-trace/async`
    
    console.log(`📡 Calling BatchData API: ${endpoint}`)
    console.log(`📦 Sending ${requests.length} request${requests.length > 1 ? 's' : ''} (${isSingleParcel ? 'synchronous' : 'asynchronous'})`)
    console.log(`📦 Request body preview:`, JSON.stringify({ requests: requests }, null, 2).substring(0, 300))
    
    // Use API token in Authorization header with Bearer format
    // Based on testing: Bearer format is recognized (returns 403 instead of 401)
    // Direct token returns 401 "Invalid token", Bearer returns 403 "No permission"
    // This indicates Bearer is the correct format, but token needs proper permissions
    const authHeader = `Bearer ${apiToken.trim()}`
    
    console.log(`🔐 Using API token with Bearer format (first 10 chars): ${apiToken.substring(0, 10)}...`)
    
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          requests: requests
        }),
        redirect: 'manual' // Don't follow redirects - we want to see the actual response
      })
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`)
      const responseHeaders = Object.fromEntries(response.headers.entries())
      console.log(`📡 Response headers:`, JSON.stringify(responseHeaders, null, 2))
      
      // If we got a redirect (3xx), log it
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        console.error(`❌ BatchData API returned redirect (${response.status}) to: ${location}`)
        console.error('❌ This suggests the endpoint URL might be incorrect')
        console.error(`❌ Tried endpoint: ${endpoint}`)
        return res.status(500).json({
          error: 'API endpoint returned redirect',
          message: `BatchData API redirected to: ${location}`,
          endpoint: endpoint
        })
      }
    } catch (fetchError) {
      console.error('❌ Fetch error calling BatchData API:', fetchError)
      throw new Error(`Failed to connect to BatchData API: ${fetchError.message}`)
    }

    console.log(`📡 BatchData API response status: ${response.status}`)
    
    // Get content type to determine how to parse response
    const contentType = response.headers.get('content-type') || ''
    const isJSON = contentType.includes('application/json')
    
    // Read response body as text first (can only be read once)
    const responseText = await response.text()
    console.log(`📄 Response content-type: ${contentType}`)
    console.log(`📄 Response preview (first 200 chars): ${responseText.substring(0, 200)}`)

    if (!response.ok) {
      console.error('❌ BatchData API error:', response.status, responseText.substring(0, 500))
      console.error('❌ Request endpoint:', endpoint)
      console.error('❌ Request headers:', {
        'Authorization': authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING',
        'Content-Type': 'application/json'
      })
      
      // Try to parse error as JSON for better error messages
      let errorDetails = responseText
      if (isJSON) {
        try {
          const errorJson = JSON.parse(responseText)
          errorDetails = errorJson
          console.error('❌ BatchData API error details:', JSON.stringify(errorJson, null, 2))
        } catch (e) {
          // Not valid JSON despite content-type
        }
      }
      
      // For 401 Unauthorized, provide more specific error message
      if (response.status === 401) {
        return res.status(401).json({ 
          error: 'Authentication failed', 
          message: 'Invalid API token or authentication method. Please check your BATCHDATA_API_KEY.',
          details: errorDetails
        })
      }
      
      // For 429 rate limit errors
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.', details: errorDetails })
      }
      
      return res.status(response.status).json({ error: 'Skip tracing failed', details: errorDetails })
    }

    // Parse response based on content type
    let result
    if (isJSON) {
      try {
        result = JSON.parse(responseText)
        console.log('✅ BatchData API response parsed as JSON')
      } catch (jsonError) {
        console.error('❌ Failed to parse BatchData API response as JSON:', jsonError)
        console.error('Raw response:', responseText.substring(0, 500))
        throw new Error(`Invalid JSON response from BatchData API: ${jsonError.message}`)
      }
    } else {
      // Response is not JSON (might be HTML error page)
      console.error('❌ BatchData API returned non-JSON response (HTML?)')
      console.error('Raw response:', responseText.substring(0, 500))
      throw new Error(`BatchData API returned unexpected content type: ${contentType}. Response appears to be HTML, not JSON.`)
    }
    
    // BatchData API v1 response format:
    // {
    //   "status": { "code": 200, "text": "OK" },
    //   "results": {
    //     "persons": [...]  // Array of person results
    //   }
    // }
    
    console.log('📦 BatchData v1 response structure:', {
      hasStatus: !!result.status,
      statusCode: result.status?.code,
      hasResults: !!result.results,
      hasPersons: !!result.results?.persons,
      personsLength: result.results?.persons?.length || 0,
      isSingleParcel
    })
    
    // Check for error status
    if (result.status && result.status.code !== 200 && result.status.code !== 0) {
      console.error('❌ BatchData API returned error status:', result.status)
      return res.status(400).json({
        error: 'BatchData API error',
        message: result.status.message || result.status.text || 'Unknown error',
        code: result.status.code,
        details: result
      })
    }
    
    // Single parcel endpoint returns results directly (synchronous)
    if (isSingleParcel) {
      // v1 API returns results in result.results.persons array
      // The persons array contains the actual person data with phones/emails
      const personsArray = result.results?.persons || []
      
      console.log(`📦 Found ${personsArray.length} persons in v1 response`)
      
      if (personsArray.length === 0) {
        console.warn('⚠️ No persons found in skip trace results')
        return res.status(200).json({
          success: true,
          jobId: 'sync',
          async: false,
          message: 'Skip tracing completed (no contact info found)',
          status: 'completed',
          results: []
        })
      }
      
      // Transform BatchData v1 format to our format
      // v1 format: result.results.persons is an array of person objects
      // Each person has: phoneNumbers[], emails[], propertyAddress, etc.
      // API response structure: person.phoneNumbers[] with { number, carrier, type, tested, reachable, score }
      const transformedResults = personsArray.map((person, personIndex) => {
        console.log(`📞 Processing person ${personIndex}:`, {
          hasPhoneNumbers: !!person.phoneNumbers,
          phoneNumbersType: Array.isArray(person.phoneNumbers) ? 'array' : typeof person.phoneNumbers,
          phoneNumbersLength: Array.isArray(person.phoneNumbers) ? person.phoneNumbers.length : 0,
          phoneNumbersSample: Array.isArray(person.phoneNumbers) ? JSON.stringify(person.phoneNumbers[0]) : person.phoneNumbers,
          hasPhones: !!person.phones, // Legacy check
          personKeys: Object.keys(person)
        })
        
        // Extract phones from person object
        // v1 API uses phoneNumbers[] array (not phones[])
        const phones = []
        if (person.phoneNumbers && Array.isArray(person.phoneNumbers)) {
          // Correct field name: phoneNumbers
          person.phoneNumbers.forEach((phoneObj, idx) => {
            // Each phone object has: { number, carrier, type, tested, reachable, score }
            const phoneNumber = phoneObj?.number
            if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
              phones.push(phoneNumber.trim())
            } else {
              console.warn(`⚠️ Phone ${idx} in person ${personIndex} has unexpected format:`, phoneObj)
            }
          })
        } else if (person.phones && Array.isArray(person.phones)) {
          // Fallback: check for phones[] (legacy format)
          person.phones.forEach((phone, idx) => {
            const phoneNumber = phone?.number || phone?.phone || phone?.phoneNumber || phone
            if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
              phones.push(phoneNumber.trim())
            } else {
              console.warn(`⚠️ Phone ${idx} in person ${personIndex} has unexpected format:`, phone)
            }
          })
        } else if (person.phone) {
          // Single phone field (not array)
          phones.push(person.phone)
        }
        
        console.log(`📞 Extracted ${phones.length} phone(s) from person ${personIndex}:`, phones)
        
        // Extract emails from person object
        const emails = []
        if (person.emails && Array.isArray(person.emails)) {
          person.emails.forEach(email => {
            const emailAddress = email?.email || email
            if (emailAddress && typeof emailAddress === 'string' && emailAddress.trim()) {
              emails.push(emailAddress.trim())
            }
          })
        } else if (person.email) {
          // Single email field (not array)
          emails.push(person.email)
        }
        
        console.log(`📧 Extracted ${emails.length} email(s) from person ${personIndex}:`, emails)
        
        // Extract address from person's propertyAddress or addresses array
        const propertyAddr = person.propertyAddress
        const addressObj = propertyAddr || (person.addresses && person.addresses[0]) || null
        const fullAddress = addressObj?.fullAddress || 
          [addressObj?.street, addressObj?.city, addressObj?.state, addressObj?.zip]
            .filter(Boolean).join(', ') || null
        
        // Build input address for matching (use propertyAddress from response)
        const inputAddr = propertyAddr
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
      
      console.log(`✅ Transformed ${transformedResults.length} skip trace results`)
      
      return res.status(200).json({
        success: true,
        jobId: 'sync',
        async: false,
        message: 'Skip tracing completed',
        status: 'completed',
        results: transformedResults
      })
    }
    
    // Multiple parcels endpoint returns job ID (asynchronous)
    // Check for requestId in result.result.meta.requestId
    const jobId = result.result?.meta?.requestId || 
                  result.meta?.requestId || 
                  result.jobId || 
                  result.id || 
                  result.job_id || 
                  result.request_id || 
                  result.batch_id
    
    if (!jobId) {
      console.error('❌ No job ID found in response')
      console.error('Response structure:', {
        hasResult: !!result.result,
        hasMeta: !!result.result?.meta,
        hasRequestId: !!result.result?.meta?.requestId,
        fullResult: JSON.stringify(result, null, 2).substring(0, 1000)
      })
      return res.status(500).json({ error: 'No job ID returned from skip tracing service', details: result })
    }

    console.log(`✅ BatchData job submitted with ID: ${jobId}`)

    return res.status(200).json({
      success: true,
      jobId: jobId,
      async: true,
      message: 'Skip tracing job submitted successfully',
      status: result.status?.text || result.status || 'pending'
    })

  } catch (error) {
    console.error('❌ Skip trace error:', error)
    console.error('Error stack:', error.stack)
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
