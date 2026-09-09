/**
 * Overlay in-flight status changes so a stale refresh cannot bounce a card
 * back to its previous column.
 */

export function applyPendingStatuses(items, pendingById) {
  if (!Array.isArray(items) || !pendingById?.size) return items || []
  return items.map((item) => {
    const status = pendingById.get(item.id)
    if (status == null || status === item.status) return item
    return { ...item, status }
  })
}

export function pruneResolvedPendingStatuses(items, pendingById) {
  if (!pendingById?.size) return pendingById || new Map()
  const byId = new Map((items || []).map((item) => [item.id, item]))
  const next = new Map(pendingById)
  let changed = false
  for (const [id, status] of pendingById) {
    if (byId.get(id)?.status === status) {
      next.delete(id)
      changed = true
    }
  }
  return changed ? next : pendingById
}

export function setPendingStatus(pendingById, id, status) {
  const next = new Map(pendingById)
  if (status == null) next.delete(id)
  else next.set(id, status)
  return next
}

export function createSerialAsyncQueue() {
  let tail = Promise.resolve()
  return function enqueue(task) {
    const run = tail.then(() => task(), () => task())
    tail = run.then(() => undefined, () => undefined)
    return run
  }
}
