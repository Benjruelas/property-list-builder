/**
 * Ops auth for parcel pipeline routes.
 * Accepts PARCEL_PIPELINE_SECRET or CRON_SECRET via Bearer / x-parcel-pipeline-secret.
 */

export function isPipelineAuthorized(req) {
  const secret = process.env.PARCEL_PIPELINE_SECRET || process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    if (auth === `Bearer ${secret}`) return true
    if (req.headers['x-parcel-pipeline-secret'] === secret) return true
    if (req.headers['x-cron-secret'] === secret) return true
    return false
  }
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return false
  }
  const host = req.headers.host || ''
  return /localhost|127\.0\.0\.1/.test(host)
}
