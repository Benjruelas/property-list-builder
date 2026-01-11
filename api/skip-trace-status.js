/**
 * Vercel Serverless Function
 * Polls Tracerfy API for skip trace job status and results
 * 
 * GET: Check job status and get results
 * Query: ?jobId=xxx
 * Returns: { status: 'completed'|'processing', results: [...] }
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

    const apiKey = process.env.TRACERFY_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Skip tracing service not configured' })
    }

    // Poll Tracerfy API for job status
    const TRACERFY_API_BASE = process.env.TRACERFY_API_BASE || 'https://api.tracerfy.com'
    const response = await fetch(`${TRACERFY_API_BASE}/queue/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Tracerfy API error:', response.status, errorText)
      return res.status(response.status).json({ error: 'Failed to fetch job status', details: errorText })
    }

    const result = await response.json()
    
    // Parse results based on Tracerfy API format
    // Format may vary - adjust based on actual API response
    const status = result.status || result.state || 'processing'
    const isComplete = status === 'completed' || status === 'done' || status === 'success'
    
    if (isComplete && result.results) {
      // Parse CSV results if API returns CSV download URL
      // For now, assume JSON format
      const results = Array.isArray(result.results) ? result.results : []
      
      return res.status(200).json({
        status: 'completed',
        results: results,
        downloadUrl: result.download_url || result.downloadUrl
      })
    } else {
      return res.status(200).json({
        status: 'processing',
        message: 'Job is still processing'
      })
    }

  } catch (error) {
    console.error('Skip trace status error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

