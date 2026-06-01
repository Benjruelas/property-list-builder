/**
 * Closed deals archive — snapshot when a deal is closed from a pipeline.
 */

const STORAGE_KEY = 'closed_deals'

export function loadClosedDeals() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveClosedDeals(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch (e) {
    console.error('Error saving closed deals:', e)
  }
}

export function addClosedDeal(record) {
  if (!record?.id) return
  const list = loadClosedDeals()
  saveClosedDeals([...list.filter((r) => r.id !== record.id), record])
}

export function removeClosedDeal(id) {
  if (!id) return
  saveClosedDeals(loadClosedDeals().filter((r) => r.id !== id))
}

export function getClosedDealById(id) {
  if (!id) return null
  return loadClosedDeals().find((r) => r.id === id) || null
}

export function buildClosedDealRecord({ deal, lead, pipeline, stageTime }) {
  const now = Date.now()
  return {
    id: deal.id,
    dealId: deal.id,
    leadId: deal.leadId,
    closedAt: now,
    closedFrom: {
      pipelineId: pipeline?.id || null,
      title: pipeline?.title || 'Pipes',
      isLocal: !pipeline?.ownerId,
      columns: pipeline?.columns || [],
    },
    deal: { ...deal },
    lead: lead ? { ...lead } : null,
    stageTime: stageTime || deal.cumulativeTimeByStatus || {},
  }
}

export const MIGRATION_FLAG = 'leads_deals_v2_migrated'

export function runLeadsDealsFreshStartMigration() {
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return false

  try {
    localStorage.removeItem('deal_pipeline_leads')
    localStorage.removeItem('closed_leads')
    localStorage.setItem(MIGRATION_FLAG, '1')
    return true
  } catch {
    return false
  }
}

export async function runApiPipelinesFreshStartMigration(getToken, pipelines, updatePipeline) {
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return { migrated: false, cleared: 0 }

  let cleared = 0
  for (const p of pipelines || []) {
    const hasLegacy = (p.leads?.length > 0) || (p.deals?.length > 0 && p.leads?.length > 0)
    const hasLeads = Array.isArray(p.leads) && p.leads.length > 0
    if (hasLeads || hasLegacy) {
      try {
        await updatePipeline(getToken, p.id, { deals: [] })
        cleared++
      } catch (e) {
        console.warn('Migration clear pipeline failed', p.id, e)
      }
    }
  }

  localStorage.removeItem('deal_pipeline_leads')
  localStorage.removeItem('closed_leads')
  localStorage.setItem(MIGRATION_FLAG, '1')
  return { migrated: true, cleared }
}
