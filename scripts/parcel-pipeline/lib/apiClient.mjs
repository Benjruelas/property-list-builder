/**
 * Optional remote catalog API client for claim/report when running against a deployment.
 */

function baseUrl() {
  return (process.env.PARCEL_PIPELINE_API_BASE || process.env.APP_ORIGIN || '').replace(/\/$/, '')
}

function headers() {
  const secret = process.env.PARCEL_PIPELINE_SECRET || process.env.CRON_SECRET || ''
  const h = { 'Content-Type': 'application/json' }
  if (secret) {
    h.Authorization = `Bearer ${secret}`
    h['X-Parcel-Pipeline-Secret'] = secret
  }
  return h
}

export function apiConfigured() {
  return Boolean(baseUrl() && (process.env.PARCEL_PIPELINE_SECRET || process.env.CRON_SECRET))
}

export async function apiClaim(claimedBy = 'cli', preferStatus) {
  const res = await fetch(`${baseUrl()}/api/parcel-pipeline/counties`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'claim', claimedBy, preferStatus }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `claim failed ${res.status}`)
  return data
}

export async function apiReport(payload) {
  const res = await fetch(`${baseUrl()}/api/parcel-pipeline/report`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `report failed ${res.status}`)
  return data
}

export async function apiGetCounty(fips) {
  const res = await fetch(
    `${baseUrl()}/api/parcel-pipeline/counties?action=get&fips=${encodeURIComponent(fips)}`,
    { headers: headers() },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `get county failed ${res.status}`)
  return data.county
}

export async function apiSummary() {
  const res = await fetch(`${baseUrl()}/api/parcel-pipeline/counties?action=summary`, {
    headers: headers(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `summary failed ${res.status}`)
  return data
}

export async function apiUpdateCounty(fips, patch) {
  const res = await fetch(`${baseUrl()}/api/parcel-pipeline/counties`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'update', fips, patch }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `update failed ${res.status}`)
  return data
}

export async function apiSeed({ force = false } = {}) {
  const res = await fetch(`${baseUrl()}/api/parcel-pipeline/counties`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'seed', force }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `seed failed ${res.status}`)
  return data
}
