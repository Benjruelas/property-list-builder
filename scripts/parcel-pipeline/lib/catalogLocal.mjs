import fs from 'fs'
import path from 'path'
import { ROOT } from './paths.mjs'

const SEED_PATH = path.join(ROOT, 'data/counties/catalog.seed.json')
const SOURCES_PATH = path.join(ROOT, 'data/counties/sources.seed.json')
const RUNTIME_SOURCES_PATH =
  process.env.PARCEL_SOURCES_RUNTIME || path.join(ROOT, 'data/counties/sources.runtime.json')

let cache = null

export function clearLocalCatalogCache() {
  cache = null
}

export function loadLocalCatalog() {
  if (cache) return cache
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
  let sources = {}
  try {
    sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources || {}
  } catch {
    sources = {}
  }
  try {
    if (fs.existsSync(RUNTIME_SOURCES_PATH)) {
      const runtime = JSON.parse(fs.readFileSync(RUNTIME_SOURCES_PATH, 'utf8')).sources || {}
      sources = { ...sources, ...runtime }
    }
  } catch {
    /* ignore */
  }
  const counties = (raw.counties || []).map((c) => {
    const src = sources[c.fips]
    if (!src) return { ...c }
    return {
      ...c,
      status: 'ready',
      source: {
        type: src.type,
        url: src.url,
        layerId: src.layerId ?? null,
        licenseNote: src.licenseNote || '',
        ...(src.where ? { where: src.where } : {}),
      },
      fieldMap: src.fieldMap || null,
    }
  })
  cache = {
    version: raw.version || 1,
    count: counties.length,
    counties,
    byFips: new Map(counties.map((c) => [c.fips, c])),
  }
  return cache
}

export function getLocalCounty(fips) {
  // Always reload so runtime source overlays are visible between child runs.
  clearLocalCatalogCache()
  const padded = String(fips).padStart(5, '0')
  const fromCatalog = loadLocalCatalog().byFips.get(padded) || null
  const runtimeSourcePath = path.join(ROOT, 'parcel_data', padded, 'source.json')
  if (fs.existsSync(runtimeSourcePath)) {
    try {
      const overlay = JSON.parse(fs.readFileSync(runtimeSourcePath, 'utf8'))
      return {
        ...(fromCatalog || { fips: padded }),
        status: 'ready',
        source: overlay.source || fromCatalog?.source,
        fieldMap: overlay.fieldMap ?? fromCatalog?.fieldMap,
      }
    } catch {
      /* fall through */
    }
  }
  return fromCatalog
}
