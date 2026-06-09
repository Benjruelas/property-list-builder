/**
 * Normalize and dedupe pipelines in the shared user_pipelines KV array.
 */

const DEFAULT_PIPELINE_TITLES = new Set(['deal pipeline', 'pipes'])

function pipelineTimestamp(p) {
  return p?.updatedAt || p?.createdAt || ''
}

export function dedupePipelinesById(pipelines) {
  if (!Array.isArray(pipelines)) return []
  const byId = new Map()
  for (const p of pipelines) {
    if (!p?.id) continue
    const existing = byId.get(p.id)
    if (!existing || pipelineTimestamp(p) > pipelineTimestamp(existing)) {
      byId.set(p.id, p)
    }
  }
  return [...byId.values()]
}

function isEmptyPipeline(p) {
  const deals = Array.isArray(p.deals) ? p.deals.length : 0
  const tasks = Array.isArray(p.tasks) ? p.tasks.length : 0
  return deals === 0 && tasks === 0
}

function isDefaultPipelineTitle(title) {
  return DEFAULT_PIPELINE_TITLES.has((title || 'deal pipeline').trim().toLowerCase())
}

/**
 * Drop redundant empty default-titled pipelines per owner (keeps newest).
 * Fixes duplicate "Deal Pipeline" rows from parallel localStorage migration.
 */
export function consolidateRedundantDefaultPipelines(pipelines) {
  const list = dedupePipelinesById(pipelines)
  const removeIds = new Set()
  const byOwner = new Map()

  for (const p of list) {
    if (!p?.ownerId || !isDefaultPipelineTitle(p.title) || !isEmptyPipeline(p)) continue
    const group = byOwner.get(p.ownerId) || []
    group.push(p)
    byOwner.set(p.ownerId, group)
  }

  for (const group of byOwner.values()) {
    if (group.length <= 1) continue
    group.sort((a, b) => pipelineTimestamp(b).localeCompare(pipelineTimestamp(a)))
    for (let i = 1; i < group.length; i++) removeIds.add(group[i].id)
  }

  if (removeIds.size === 0) return list
  return list.filter((p) => !removeIds.has(p.id))
}

export function normalizePipelineStore(pipelines) {
  return consolidateRedundantDefaultPipelines(pipelines)
}
