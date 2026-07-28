/**
 * Pipeline task helpers — read-only flattening for legacy paths.
 * Task mutations use /api/tasks via serverTaskOps.
 */

export function flattenPipelineTasks(pipelines) {
  if (!Array.isArray(pipelines)) return []
  const out = []
  for (const p of pipelines) {
    if (!p || !Array.isArray(p.tasks)) continue
    for (const t of p.tasks) {
      if (!t || !(t.title ?? '').toString().trim()) continue
      let leadId = t.leadId || null
      if (!leadId && t.parcelId) {
        const key = String(t.parcelId)
        const lead = (p.leads || []).find(
          (l) => String(l.parcelId) === key || String(l.id) === key,
        )
        if (lead?.id) leadId = lead.id
      }
      out.push({
        ...t,
        leadId,
        pipelineId: p.id,
        __source: 'pipeline',
      })
    }
  }
  return out
}

export function pipelinesContainingParcel(pipelines, parcelId) {
  if (!parcelId || !Array.isArray(pipelines)) return []
  const key = String(parcelId)
  return pipelines.filter(
    (p) =>
      Array.isArray(p.leads) &&
      p.leads.some((l) => String(l.parcelId) === key || String(l.id) === key),
  )
}
