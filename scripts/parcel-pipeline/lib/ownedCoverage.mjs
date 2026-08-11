/**
 * Counties already owned in R2 (PMTiles manifest). Used so nationwide workers
 * never re-download / re-tile completed work across VMs.
 */
import { getObjectBuffer } from './r2.mjs'
import { OWNED_PMTILES_MANIFEST_KEY } from '../../../api/_lib/parcelPipeline/constants.js'

let cache = { at: 0, fips: new Set() }
const TTL_MS = Number(process.env.PARCEL_OWNED_MANIFEST_TTL_MS || 60_000)

/** @returns {Promise<Set<string>>} */
export async function loadOwnedFips({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache.fips.size && now - cache.at < TTL_MS) return cache.fips
  try {
    const buf = await getObjectBuffer(OWNED_PMTILES_MANIFEST_KEY)
    const fips = new Set()
    if (buf) {
      const manifest = JSON.parse(buf.toString('utf8'))
      for (const k of Object.keys(manifest.counties || {})) {
        fips.add(String(k).padStart(5, '0'))
      }
    }
    cache = { at: now, fips }
    return fips
  } catch (e) {
    console.warn('[owned] manifest load failed:', e.message)
    return cache.fips
  }
}

export function rememberOwnedFips(fips) {
  cache.fips.add(String(fips).padStart(5, '0'))
  cache.at = Date.now()
}
