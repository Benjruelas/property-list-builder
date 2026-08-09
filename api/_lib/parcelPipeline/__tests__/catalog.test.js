import { describe, it, expect } from 'vitest'
import { loadSeedCatalog } from '../catalog.js'

describe('parcelPipeline catalog seed', () => {
  it('loads US counties and marks seeded sources ready', () => {
    const seed = loadSeedCatalog()
    expect(seed.count).toBeGreaterThan(3000)
    expect(seed.byFips.get('01001')?.name).toBe('Autauga')
    const tarrant = seed.byFips.get('48439')
    expect(tarrant).toBeTruthy()
    expect(tarrant.status).toBe('ready')
    expect(tarrant.source?.type).toBe('arcgis')
    expect(tarrant.source?.url).toMatch(/tarrant/i)
    expect(tarrant.fieldMap?.parcelid).toBeTruthy()
  })

  it('leaves counties without sources as needs_source', () => {
    const seed = loadSeedCatalog()
    const plain = seed.counties.find((c) => c.status === 'needs_source')
    expect(plain).toBeTruthy()
    expect(plain.source).toBeNull()
  })
})
