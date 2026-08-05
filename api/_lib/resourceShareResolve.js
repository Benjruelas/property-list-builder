/**
 * Resolve a share invite token to surface-level preview fields (no auth).
 */

import { findResourceShareInviteByToken } from './resourceShareInvites.js'
import { getLeadByIdIndexed } from './leadLookup.js'
import { findPipelineById } from './pipelineRepo.js'
import { getAllPipelines } from './pipelineStoreFull.js'
import {
  buildLeadSharePreview,
  buildDealSharePreview,
  previewDescription,
} from './resourceSharePreview.js'

async function resolveDealForInvite(invite) {
  let pipeline = null
  if (invite.pipelineId) {
    pipeline = await findPipelineById(invite.pipelineId)
  }
  if (!pipeline) {
    const all = await getAllPipelines()
    pipeline = (all || []).find((p) =>
      (p.deals || []).some((d) => String(d?.id) === String(invite.resourceId)),
    ) || null
  }
  if (!pipeline) return { deal: null, lead: null }
  const deal = (pipeline.deals || []).find((d) => String(d?.id) === String(invite.resourceId)) || null
  if (!deal) return { deal: null, lead: null }
  const lead = deal.leadId ? await getLeadByIdIndexed(deal.leadId) : null
  return { deal, lead }
}

export async function resolveSharePreview(token) {
  const { invite, error } = await findResourceShareInviteByToken(token)
  if (error || !invite) {
    return { error: error || 'not_found', invite: null, preview: null }
  }

  if (invite.resourceType === 'lead') {
    const lead = await getLeadByIdIndexed(invite.resourceId)
    if (!lead) return { error: 'gone', invite, preview: null }
    const preview = buildLeadSharePreview(lead)
    return { error: null, invite, preview, description: previewDescription(preview) }
  }

  if (invite.resourceType === 'deal') {
    const { deal, lead } = await resolveDealForInvite(invite)
    if (!deal) return { error: 'gone', invite, preview: null }
    const preview = buildDealSharePreview(deal, lead)
    return { error: null, invite, preview, description: previewDescription(preview) }
  }

  return { error: 'not_found', invite, preview: null }
}
