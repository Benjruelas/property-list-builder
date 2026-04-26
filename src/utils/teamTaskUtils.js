/**
 * Team tasks live on `lead.teamTasks` in each pipeline. Helpers for flattening
 * into a unified task shape and resolving assignable members from shared teams.
 */

/**
 * All distinct members (uid + email) from teams whose ids appear in
 * `pipeline.teamShares`, sorted by email.
 */
export function getMembersForTeamSharedPipeline(pipeline, teams) {
  if (!pipeline || !Array.isArray(teams)) return []
  const shareIds = new Set(
    (Array.isArray(pipeline.teamShares) ? pipeline.teamShares : []).filter(Boolean)
  )
  if (shareIds.size === 0) return []
  const byUid = new Map()
  for (const t of teams) {
    if (!t || !shareIds.has(t.id)) continue
    for (const m of t.members || []) {
      if (!m?.uid || byUid.has(m.uid)) continue
      byUid.set(m.uid, { uid: m.uid, email: m.email || m.uid, role: m.role })
    }
  }
  return [...byUid.values()].sort((a, b) =>
    (a.email || '').localeCompare(b.email || '', undefined, { sensitivity: 'base' })
  )
}

function numish(v) {
  if (v == null) return null
  if (typeof v === 'string' && v.includes('T')) {
    const n = new Date(v).getTime()
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Flatten `leads[].teamTasks` with annotations for the Tasks panel and schedule.
 * Maps `dueAt` → `scheduledAt` for shared UI. Sets `__source: 'team'`.
 */
export function flattenTeamTasks(pipelines) {
  if (!Array.isArray(pipelines)) return []
  const out = []
  for (const p of pipelines) {
    if (!p?.id) continue
    for (const lead of p.leads || []) {
      if (!lead) continue
      for (const t of lead.teamTasks || []) {
        if (!t || !(t.title ?? '').toString().trim()) continue
        const completedAtRaw = t.completedAt
        const completedAt = completedAtRaw
          ? numish(completedAtRaw)
          : null
        const createdAt = numish(t.createdAt) ?? Date.now()
        const dueAt = t.dueAt != null ? numish(t.dueAt) : null
        out.push({
          ...t,
          id: t.id,
          title: t.title,
          completed: !!t.completedAt,
          completedAt,
          createdAt,
          dueAt,
          scheduledAt: dueAt,
          scheduledEndAt: null,
          pipelineId: p.id,
          leadId: lead.id,
          parcelId: lead.parcelId || null,
          __source: 'team',
          assignedUids: Array.isArray(t.assignedUids) ? t.assignedUids.filter(Boolean) : []
        })
      }
    }
  }
  return out
}

/**
 * Resolves uids to emails using known teams; falls back to uid.
 */
export function formatAssigneeList(assignedUids, teams) {
  if (!Array.isArray(assignedUids) || assignedUids.length === 0) return null
  const byUid = new Map()
  for (const t of teams || []) {
    for (const m of t?.members || []) {
      if (m?.uid) byUid.set(m.uid, m.email || m.uid)
    }
  }
  return assignedUids
    .map((u) => byUid.get(u) || u)
    .filter(Boolean)
    .join(', ')
}
