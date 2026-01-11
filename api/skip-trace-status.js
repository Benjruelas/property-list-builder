/**
 * Vercel Serverless Function
 * Polls Tracerfy API for skip trace job status and results
 * 
 * GET: Check job status and get results
 * Query: ?jobId=xxx (or queueId)
 * Returns: { status: 'completed'|'processing', results: [...] }
 * 
 * Documentation: https://tracerfy.com/skip-tracing-api-documentation/
 * Base URL: https://tracerfy.com/v1/api/
 */

/**
 * Parse CSV results from Tracerfy API
 * @param {string} csvText - CSV text content
 * @returns {Array} Parsed results array
 */
function parseCsvResults(csvText) {
  if (!csvText || !csvText.trim()) {
    return []
  }
  
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    return [] // Need at least header + 1 data row
  }
  
  // Parse header
  const header = parseCsvLine(lines[0])
  const headerMap = {}
  header.forEach((col, index) => {
    headerMap[col.toLowerCase().trim()] = index
  })
  
  // Parse data rows
  const results = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (row.length === 0) continue
    
    // Extract phone numbers
    const phones = [
      getField(row, headerMap, 'primary_phone'),
      getField(row, headerMap, 'mobile_1'),
      getField(row, headerMap, 'mobile_2'),
      getField(row, headerMap, 'mobile_3'),
      getField(row, headerMap, 'mobile_4'),
      getField(row, headerMap, 'mobile_5'),
      getField(row, headerMap, 'landline_1'),
      getField(row, headerMap, 'landline_2'),
      getField(row, headerMap, 'landline_3')
    ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
    
    // Extract emails
    const emails = [
      getField(row, headerMap, 'email_1'),
      getField(row, headerMap, 'email_2'),
      getField(row, headerMap, 'email_3'),
      getField(row, headerMap, 'email_4'),
      getField(row, headerMap, 'email_5')
    ].filter(Boolean)
    
    // Extract mailing address (output address from Tracerfy)
    const mailingAddress = [
      getField(row, headerMap, 'mail_address'),
      getField(row, headerMap, 'mail_city'),
      getField(row, headerMap, 'mail_state'),
      getField(row, headerMap, 'mail_zip')
    ].filter(Boolean).join(', ')
    
    // Extract input address fields (for matching back to original parcels)
    const inputAddress = getField(row, headerMap, 'address') || ''
    const inputCity = getField(row, headerMap, 'city') || ''
    const inputState = getField(row, headerMap, 'state') || ''
    const inputZip = getField(row, headerMap, 'zip') || ''
    const inputFirstName = getField(row, headerMap, 'first_name') || ''
    const inputLastName = getField(row, headerMap, 'last_name') || ''
    
    // Build normalized input address for matching (address, city, state)
    const inputAddressForMatching = [
      inputAddress,
      inputCity,
      inputState
    ].filter(Boolean).join(', ').toLowerCase().trim()
    
    results.push({
      phone: phones[0] || null,
      phoneNumbers: phones,
      email: emails[0] || null,
      emails: emails,
      address: mailingAddress || null,
      // Include input address fields for matching
      inputAddress: inputAddressForMatching,
      inputAddressRaw: inputAddress,
      inputCity: inputCity,
      inputState: inputState,
      inputZip: inputZip,
      inputFirstName: inputFirstName,
      inputLastName: inputLastName
    })
  }
  
  return results
}

/**
 * Parse a CSV line, handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array} Array of field values
 */
function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  // Add last field
  fields.push(current.trim())
  
  return fields
}

/**
 * Get field value from row using header map
 * @param {Array} row - Data row
 * @param {Object} headerMap - Map of column name to index
 * @param {string} fieldName - Field name to look up
 * @returns {string|null} Field value or null
 */
function getField(row, headerMap, fieldName) {
  const index = headerMap[fieldName.toLowerCase().trim()]
  if (index !== undefined && row[index]) {
    return row[index].trim() || null
  }
  return null
}

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
    const { jobId, queueId } = req.query
    const id = queueId || jobId // Support both for backward compatibility

    if (!id) {
      return res.status(400).json({ error: 'jobId or queueId query parameter is required' })
    }

    const apiKey = process.env.TRACERFY_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Skip tracing service not configured' })
    }

    // Poll Tracerfy API for queue status
    // First check if queue is complete via /queues/ endpoint
    const TRACERFY_API_BASE = process.env.TRACERFY_API_BASE || 'https://tracerfy.com/v1/api'
    
    // Get queue details
    const queueResponse = await fetch(`${TRACERFY_API_BASE}/queue/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text()
      console.error('Tracerfy API error:', queueResponse.status, errorText)
      return res.status(queueResponse.status).json({ error: 'Failed to fetch queue status', details: errorText })
    }

    // If queue endpoint returns data, it means the queue exists
    // For pending queues, the endpoint might return empty or status
    // For completed queues, it returns the CSV data
    const contentType = queueResponse.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      // Check if it's queue metadata or results
      const data = await queueResponse.json()
      
      // If it's an array, it's the results (completed queue)
      if (Array.isArray(data)) {
        // Transform Tracerfy results to our format
        const results = data.map((row, index) => {
          // Combine all phone numbers (primary_phone, mobile_1-5, landline_1-3)
          const phones = [
            row.primary_phone,
            row.mobile_1,
            row.mobile_2,
            row.mobile_3,
            row.mobile_4,
            row.mobile_5,
            row.landline_1,
            row.landline_2,
            row.landline_3
          ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
          
          // Combine all emails (email_1-5)
          const emails = [
            row.email_1,
            row.email_2,
            row.email_3,
            row.email_4,
            row.email_5
          ].filter(Boolean)
          
          // Combine mailing address (output address from Tracerfy)
          const mailingAddress = [
            row.mail_address,
            row.mail_city,
            row.mail_state,
            row.mail_zip
          ].filter(Boolean).join(', ')
          
          // Extract input address fields (for matching back to original parcels)
          const inputAddress = (row.address || '').trim()
          const inputCity = (row.city || '').trim()
          const inputState = (row.state || '').trim()
          const inputZip = (row.zip || '').trim()
          const inputFirstName = (row.first_name || '').trim()
          const inputLastName = (row.last_name || '').trim()
          
          // Build normalized input address for matching (address, city, state)
          const inputAddressForMatching = [
            inputAddress,
            inputCity,
            inputState
          ].filter(Boolean).join(', ').toLowerCase().trim()
          
          return {
            phone: phones[0] || null, // Primary phone
            phoneNumbers: phones, // All phones
            email: emails[0] || null, // Primary email
            emails: emails, // All emails
            address: mailingAddress || null,
            // Include input address fields for matching
            inputAddress: inputAddressForMatching,
            inputAddressRaw: inputAddress,
            inputCity: inputCity,
            inputState: inputState,
            inputZip: inputZip,
            inputFirstName: inputFirstName,
            inputLastName: inputLastName
          }
        })
        
        return res.status(200).json({
          status: 'completed',
          results: results
        })
      }
      
      // Otherwise, it might be queue metadata
      if (data.pending === false && data.download_url) {
        // Download CSV from download_url and parse it
        try {
          const csvResponse = await fetch(data.download_url, {
            headers: {
              'Authorization': `Bearer ${apiKey}`
            }
          })
          
          if (!csvResponse.ok) {
            console.error('Failed to download CSV:', csvResponse.status)
            return res.status(500).json({ error: 'Failed to download results CSV' })
          }
          
          const csvText = await csvResponse.text()
          const results = parseCsvResults(csvText)
          
          return res.status(200).json({
            status: 'completed',
            results: results
          })
        } catch (error) {
          console.error('Error downloading/parsing CSV:', error)
          return res.status(500).json({ error: 'Failed to process results CSV', message: error.message })
        }
      }
      
      return res.status(200).json({
        status: 'processing',
        message: 'Queue is still processing'
      })
    } else if (contentType.includes('text/csv')) {
      // If it's CSV, parse it
      const csvText = await queueResponse.text()
      const results = parseCsvResults(csvText)
      
      return res.status(200).json({
        status: 'completed',
        results: results
      })
    } else {
      // Unknown content type
      return res.status(200).json({
        status: 'processing',
        message: 'Queue is still processing'
      })
    }

  } catch (error) {
    console.error('Skip trace status error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
