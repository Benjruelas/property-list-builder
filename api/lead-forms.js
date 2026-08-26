import { requireAuth } from './_lib/apiAuth.js'
import { getAllTeams } from './_lib/teams.js'
import { getLeadWithAccess } from './_lib/leadAccess.js'
import { listLeadFormActivityForUser } from './_lib/leadForms.js'

/**
 * GET ?leadId= — form invites and submissions for a lead.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const leadId = String(req.query?.leadId || '').trim()
    if (!leadId) return res.status(400).json({ error: 'leadId is required' })

    const { lead, access } = await getLeadWithAccess(user, leadId)
    if (!lead || !access) return res.status(404).json({ error: 'Lead not found' })

    const allTeams = await getAllTeams()
    const items = await listLeadFormActivityForUser(leadId, user, allTeams, { hasLeadAccess: true })
    return res.status(200).json({ items })
  } catch (err) {
    console.error('lead-forms error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
