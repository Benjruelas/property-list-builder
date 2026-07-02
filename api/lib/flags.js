/**
 * Feature flags for incremental infra rollout. All default to current behavior (off).
 */

function envFlag(name, defaultValue = false) {
  const v = process.env[name]
  if (v === undefined || v === '') return defaultValue
  return v === '1' || v === 'true' || v === 'on'
}

const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

function envShardMode(name) {
  const v = process.env[name]
  if (v === 'shadow') return 'shadow'
  if (v === 'on' || v === '1' || v === 'true') return 'on'
  return 'off'
}

export const flags = {
  AUTH_CACHE: () => envFlag('FLAG_AUTH_CACHE'),
  /** When on, verify locally AND via REST; log mismatches without changing auth result. */
  AUTH_CACHE_SHADOW: () => envFlag('FLAG_AUTH_CACHE_SHADOW'),
  // Locks protect read-modify-write on the shared monolith keys. Default ON in
  // production to prevent lost updates from concurrent edits.
  LEADS_LOCK: () => envFlag('FLAG_LEADS_LOCK', isProd()),
  PIPELINES_LOCK: () => envFlag('FLAG_PIPELINES_LOCK', envFlag('FLAG_LEADS_LOCK', isProd())),
  VERSIONED_POLL: () => envFlag('FLAG_VERSIONED_POLL'),
  LEADS_SHARDED: () => envShardMode('FLAG_LEADS_SHARDED'),
  PIPELINES_SHARDED: () => envShardMode('FLAG_PIPELINES_SHARDED'),
  PRESIGNED_PHOTOS: () => envFlag('FLAG_PRESIGNED_PHOTOS'),
  LEADS_LIST_VIEW: () => envFlag('FLAG_LEADS_LIST_VIEW'),
}

export default flags
