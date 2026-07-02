/**
 * Prune long-dead invites so the invite monolith arrays don't grow forever.
 * An invite is prunable when it expired / was revoked / was submitted more than
 * PRUNE_GRACE_DAYS ago (recent history is kept for resend detection and audit).
 */

const PRUNE_GRACE_DAYS = 90
const GRACE_MS = PRUNE_GRACE_DAYS * 24 * 60 * 60 * 1000

function ts(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

export function pruneDeadInvites(invites, now = Date.now()) {
  if (!Array.isArray(invites)) return []
  const cutoff = now - GRACE_MS
  return invites.filter((inv) => {
    if (!inv) return false
    const expiredAt = ts(inv.expiresAt)
    const endedAt = Math.max(ts(inv.revokedAt), ts(inv.submittedAt), expiredAt)
    if (!endedAt) return true
    // Keep anything still active or that ended within the grace window.
    return endedAt > cutoff
  })
}

export default pruneDeadInvites
