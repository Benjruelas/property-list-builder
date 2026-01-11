/**
 * Vercel Serverless Function
 * Handles skip tracing via Tracerfy API
 * 
 * POST: Skip trace one or more parcels
 * Body: { parcels: [{ parcelId, address, ownerName }] }
 * 
 * Note: Tracerfy API is async (CSV upload → job ID → polling for results)
 * This endpoint submits the job and returns a job ID
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

    // Create CSV content
    const csvRows = parcels.map(p => {
      const address = (p.address || '').trim()
      const ownerName = (p.ownerName || '').trim()
      const escapeCsvField = (field) => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`
        }
        return field
      }
      return `${escapeCsvField(address)},${escapeCsvField(ownerName)}`
    })

    const csvContent = `Address,Owner Name\n${csvRows.join('\n')}`
    const csvBuffer = Buffer.from(csvContent, 'utf-8')

    // Create FormData
    const FormData = (await import('form-data')).default
    const formData = new FormData()
    formData.append('file', csvBuffer, { filename: 'parcels.csv', contentType: 'text/csv' })

    // Submit to Tracerfy API
    const TRACERFY_API_BASE = process.env.TRACERFY_API_BASE || 'https://api.tracerfy.com'
    const response = await fetch(`${TRACERFY_API_BASE}/trace/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Tracerfy API error:', response.status, errorText)
      return res.status(response.status).json({ error: 'Skip tracing failed', details: errorText })
    }

    const result = await response.json()
    
    // Tracerfy returns a job ID for async processing
    const jobId = result.job_id || result.id || result.queue_id
    if (!jobId) {
      return res.status(500).json({ error: 'No job ID returned from skip tracing service' })
    }

    return res.status(200).json({
      success: true,
      jobId: jobId,
      async: true,
      message: 'Skip tracing job submitted successfully'
    })

  } catch (error) {
    console.error('Skip trace error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
