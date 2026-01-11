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

    // Parse addresses to extract components
    // Tracerfy API requires: address, city, state, first_name, last_name, mail_address, mail_city, mail_state
    // For now, we'll use the same address for both property and mailing
    const parseAddress = (addressStr) => {
      // Simple parsing: assume format like "123 Main St, City, TX 12345" or "123 Main St, City, TX"
      const parts = addressStr.split(',').map(p => p.trim())
      if (parts.length >= 3) {
        const street = parts[0]
        const city = parts[1]
        const stateZip = parts[2].split(/\s+/)
        const state = stateZip[0]
        const zip = stateZip[1] || ''
        return { street, city, state, zip }
      } else if (parts.length === 2) {
        return { street: parts[0], city: parts[1], state: 'TX', zip: '' }
      }
      return { street: addressStr, city: '', state: 'TX', zip: '' }
    }

    const parseName = (nameStr) => {
      const parts = nameStr.trim().split(/\s+/)
      if (parts.length === 0) return { first: '', last: '' }
      if (parts.length === 1) return { first: '', last: parts[0] }
      const last = parts[parts.length - 1]
      const first = parts.slice(0, -1).join(' ')
      return { first, last }
    }

    // Build CSV with required columns
    const csvRows = parcels.map(p => {
      const address = (p.address || '').trim()
      const ownerName = (p.ownerName || '').trim()
      
      if (!address) return null
      
      const addr = parseAddress(address)
      const name = parseName(ownerName)
      
      // Tracerfy requires these columns (using same address for property and mailing)
      const escapeCsvField = (field) => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`
        }
        return field
      }
      
      return [
        escapeCsvField(addr.street),      // address
        escapeCsvField(addr.city),        // city
        escapeCsvField(addr.state),       // state
        escapeCsvField(addr.zip),         // zip
        escapeCsvField(name.first),       // first_name
        escapeCsvField(name.last),        // last_name
        escapeCsvField(addr.street),      // mail_address (using same as property)
        escapeCsvField(addr.city),        // mail_city
        escapeCsvField(addr.state),       // mail_state
        escapeCsvField(addr.zip)          // mailing_zip
      ].join(',')
    }).filter(Boolean)

    if (csvRows.length === 0) {
      return res.status(400).json({ error: 'No valid addresses found' })
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
