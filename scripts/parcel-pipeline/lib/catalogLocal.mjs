import fs from 'fs'
import path from 'path'
import { ROOT } from './paths.mjs'

const SEED_PATH = path.join(ROOT, 'data/counties/catalog.seed.json')
const SOURCES_PATH = path.join(ROOT, 'data/counties/sources.seed.json')

let cache = null

export function loadLocalCatalog() {
  if (cache) return cache
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
  let sources = {}
  try {
    sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources || {}
  } catch {
    sources = {}
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
  const padded = String(fips).padStart(5, '0')
  return loadLocalCatalog().byFips.get(padded) || null
}
