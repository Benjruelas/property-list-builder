/**
 * Vercel Serverless Function
 * Handles skip tracing via Tracerfy API
 * 
 * POST: Skip trace one or more parcels
 * Body: { parcels: [{ parcelId, address, ownerName }] }
 * 
 * Documentation: https://tracerfy.com/skip-tracing-api-documentation/
 * Base URL: https://tracerfy.com/v1/api/
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

    const apiKey = process.env.TRACERFY_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Skip tracing service not configured' })
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

    // Parse addresses - Tracerfy requires city and state (not empty)
    // Many parcel addresses are just street addresses, so we need to extract city/state if present
    const parseAddress = (addressStr) => {
      if (!addressStr || !addressStr.trim()) return null
      
      const parts = addressStr.split(',').map(p => p.trim()).filter(p => p.length > 0)
      let street = addressStr
      let city = ''
      let state = ''
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
          // If no match, treat last part as state
          state = lastPart.toUpperCase().substring(0, 2)
        }
      } else if (parts.length === 2) {
        // Format: "123 Main St, City" or "123 Main St, TX"
        street = parts[0]
        const secondPart = parts[1]
        // Check if second part is a state (2 letters) or city
        if (/^[A-Z]{2}$/.test(secondPart.toUpperCase())) {
          state = secondPart.toUpperCase()
          city = '' // No city
        } else {
          city = secondPart
          state = 'TX' // Default to Texas
        }
      } else {
        // Just street address - no city/state
        street = parts[0]
        // We'll filter these out as Tracerfy requires city and state
        return null
      }
      
      // Tracerfy requires city and state - filter out if missing
      if (!city || !state) {
        return null
      }
      
      return { street, city, state, zip }
    }

    // Escape CSV field
    const escapeCsvField = (field) => {
      const str = String(field || '').trim()
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Build CSV with required columns - filter out invalid rows
    const csvRows = parcels.map(p => {
      const address = (p.address || '').trim()
      const ownerName = (p.ownerName || '').trim()
      
      if (!address || !ownerName) return null
      
      const addr = parseAddress(address)
      if (!addr) return null // Skip if address parsing failed (no city/state)
      
      const name = parseName(ownerName)
      if (!name.last) return null // Skip if no last name
      
      // Tracerfy requires these columns (using same address for property and mailing)
      return [
        escapeCsvField(addr.street),      // address
        escapeCsvField(addr.city),        // city (required, non-empty)
        escapeCsvField(addr.state),       // state (required, non-empty)
        escapeCsvField(addr.zip),         // zip (optional)
        escapeCsvField(name.first),       // first_name (can be empty)
        escapeCsvField(name.last),        // last_name (required)
        escapeCsvField(addr.street),      // mail_address (using same as property)
        escapeCsvField(addr.city),        // mail_city (required)
        escapeCsvField(addr.state),       // mail_state (required)
        escapeCsvField(addr.zip)          // mailing_zip (optional)
      ].join(',')
    }).filter(Boolean)

    if (csvRows.length === 0) {
      return res.status(400).json({ error: 'No valid addresses found. Addresses must include city and state (e.g., "123 Main St, City, TX")' })
    }

    const csvHeader = 'address,city,state,zip,first_name,last_name,mail_address,mail_city,mail_state,mailing_zip'
    const csvContent = `${csvHeader}\n${csvRows.join('\n')}`
    
    // Create multipart/form-data manually for Node.js compatibility
    const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substring(2, 9)}`
    const closeDelim = `\r\n--${boundary}--\r\n`
    
    // Tracerfy API requires form fields for column names
    const formFields = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="address_column"\r\n\r\naddress\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="city_column"\r\n\r\ncity\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="state_column"\r\n\r\nstate\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="zip_column"\r\n\r\nzip\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="first_name_column"\r\n\r\nfirst_name\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="last_name_column"\r\n\r\nlast_name\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="mail_address_column"\r\n\r\nmail_address\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="mail_city_column"\r\n\r\nmail_city\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="mail_state_column"\r\n\r\nmail_state\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="mailing_zip_column"\r\n\r\nmailing_zip\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="trace_type"\r\n\r\nnormal\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="csv_file"; filename="parcels.csv"\r\n`,
      `Content-Type: text/csv\r\n\r\n`,
      csvContent,
      closeDelim
    ]
    
    const body = formFields.join('')
    const bodyBuffer = Buffer.from(body, 'utf-8')

    // Submit to Tracerfy API
    const TRACERFY_API_BASE = process.env.TRACERFY_API_BASE || 'https://tracerfy.com/v1/api'
    const response = await fetch(`${TRACERFY_API_BASE}/trace/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length.toString()
      },
      body: bodyBuffer
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Tracerfy API error:', response.status, errorText)
      return res.status(response.status).json({ error: 'Skip tracing failed', details: errorText })
    }

    const result = await response.json()
    
    // Tracerfy returns queue_id (not job_id)
    const queueId = result.queue_id || result.id
    if (!queueId) {
      return res.status(500).json({ error: 'No queue ID returned from skip tracing service', details: result })
    }

    return res.status(200).json({
      success: true,
      jobId: queueId, // Keep jobId for backward compatibility
      queueId: queueId,
      async: true,
      message: 'Skip tracing job submitted successfully',
      status: result.status || 'pending'
    })

  } catch (error) {
    console.error('Skip trace error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
