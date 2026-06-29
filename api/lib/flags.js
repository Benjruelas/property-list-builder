/**
 * Feature flags for incremental infra rollout. All default to current behavior (off).
 */

function envFlag(name, defaultValue = false) {
  const v = process.env[name]
  if (v === undefined || v === '') return defaultValue
  return v === '1' || v === 'true' || v === 'on'
}

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
  LEADS_LOCK: () => envFlag('FLAG_LEADS_LOCK'),
  PIPELINES_LOCK: () => envFlag('FLAG_PIPELINES_LOCK', envFlag('FLAG_LEADS_LOCK')),
  VERSIONED_POLL: () => envFlag('FLAG_VERSIONED_POLL'),
  LEADS_SHARDED: () => envShardMode('FLAG_LEADS_SHARDED'),
  PIPELINES_SHARDED: () => envShardMode('FLAG_PIPELINES_SHARDED'),
  PRESIGNED_PHOTOS: () => envFlag('FLAG_PRESIGNED_PHOTOS'),
  LEADS_LIST_VIEW: () => envFlag('FLAG_LEADS_LIST_VIEW'),
}

export default flags
