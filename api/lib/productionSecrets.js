/**
 * Fail closed in production when required secrets are missing.
 * Call from sensitive routes at handler start.
 */

const REQUIRED_IN_PROD = [
  { name: 'PREVIEW_LINK_SECRET', minLen: 16 },
  { name: 'CRON_SECRET', minLen: 16 },
]

export function isProductionEnv() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

export function assertProductionSecrets(names = REQUIRED_IN_PROD.map((s) => s.name)) {
  if (!isProductionEnv()) return
  const missing = []
  for (const spec of REQUIRED_IN_PROD) {
    if (!names.includes(spec.name)) continue
    const val = process.env[spec.name]
    if (!val || val.length < spec.minLen) missing.push(spec.name)
  }
  if (missing.length > 0) {
    throw new Error(`Missing required production secrets: ${missing.join(', ')}`)
  }
}

export function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || ''
  const fromEnv = raw.split(',').map((o) => o.trim()).filter(Boolean)
  if (fromEnv.length > 0) return fromEnv
  return [
    'https://knockscout.app',
    'https://www.knockscout.app',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
  ]
}
