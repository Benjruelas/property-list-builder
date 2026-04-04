export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const {
    address,
    lat,
    lng,
    solar_imagery_base64,
    sentinel_images,
    hail_events,
    roof_metadata,
  } = body

  const contentBlocks = []

  contentBlocks.push({
    type: 'text',
    text: `You are a professional roof inspector AI. Analyze the following data for the property at ${address || `${lat}, ${lng}`} and provide a structured assessment.

Your analysis should include:
1. Estimated roof age (years) based on visual condition
2. Year of last roof replacement (if detectable from satellite imagery changes)
3. Hail damage likelihood score (0-100) based on storm history and visual evidence
4. Confidence level (low/medium/high)
5. Detailed reasoning
6. Specific visual findings

ROOF METADATA:
${JSON.stringify(roof_metadata || {}, null, 2)}

HAIL EVENT HISTORY (within 5 miles):
${JSON.stringify((hail_events || []).slice(0, 50), null, 2)}

Respond ONLY with valid JSON in this exact format:
{
  "roof_age_estimate": <number or null>,
  "last_replacement_year": <number or null>,
  "hail_damage_score": <0-100>,
  "hail_damage_confidence": "low" | "medium" | "high",
  "roof_condition": "good" | "fair" | "poor" | "unknown",
  "reasoning": "<detailed paragraph>",
  "visual_findings": ["<finding 1>", "<finding 2>", ...]
}`,
  })

  if (solar_imagery_base64) {
    const mediaType = solar_imagery_base64.startsWith('data:image/png')
      ? 'image/png'
      : solar_imagery_base64.startsWith('data:image/tiff')
        ? 'image/tiff'
        : 'image/jpeg'

    const base64Data = solar_imagery_base64.replace(/^data:image\/\w+;base64,/, '')

    contentBlocks.push({
      type: 'text',
      text: '\n\nHIGH-RESOLUTION CURRENT ROOF IMAGE (Google Solar API):',
    })
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    })
  }

  if (sentinel_images?.length) {
    contentBlocks.push({
      type: 'text',
      text: `\n\nHISTORICAL SATELLITE IMAGERY (${sentinel_images.length} yearly snapshots from Sentinel-2):`,
    })

    const selected = sentinel_images.slice(0, 6)
    for (const img of selected) {
      if (img.image_base64) {
        contentBlocks.push({
          type: 'text',
          text: `\nYear ${img.year}:`,
        })
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: img.image_base64.replace(/^data:image\/\w+;base64,/, ''),
          },
        })
      }
    }
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      console.error('Claude API error:', claudeRes.status, errText)
      return res.status(502).json({ error: `Claude API error: ${claudeRes.status}` })
    }

    const claudeData = await claudeRes.json()
    const responseText = claudeData.content?.[0]?.text || ''

    let analysis
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { reasoning: responseText }
    } catch {
      analysis = { reasoning: responseText }
    }

    return res.status(200).json({
      analysis,
      model: claudeData.model,
      usage: claudeData.usage,
    })
  } catch (e) {
    console.error('Claude request error:', e.message)
    return res.status(502).json({ error: 'Failed to contact Claude API' })
  }
}
