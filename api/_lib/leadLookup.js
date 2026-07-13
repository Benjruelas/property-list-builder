/**
 * Indexed lead lookup without loading the full user_leads catalog.
 */

import { getLeadEntity } from './entityLeadStore.js'

export async function getLeadByIdIndexed(leadId) {
  if (!leadId) return null
  return getLeadEntity(leadId)
}
