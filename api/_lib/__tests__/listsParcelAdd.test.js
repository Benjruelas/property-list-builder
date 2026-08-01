import { describe, expect, it } from 'vitest'
import { parcelsToAdd } from '../listParcels.js'

describe('parcelsToAdd', () => {
  it('counts only newly added parcels when the client sends full membership', () => {
    const existing = Array.from({ length: 814 }, (_, i) => ({ id: `p${i}` }))
    const incoming = [
      ...existing,
      ...Array.from({ length: 100 }, (_, i) => ({ id: `new${i}` })),
    ]

    const toAdd = parcelsToAdd(existing, incoming)

    expect(toAdd).toHaveLength(100)
    expect(toAdd.map((p) => p.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => `new${i}`),
    )
  })

  it('returns empty when all incoming parcels already exist', () => {
    const existing = [{ id: 'a' }, { id: 'b' }]
    expect(parcelsToAdd(existing, [{ id: 'a' }, { id: 'b' }])).toEqual([])
  })

  it('accepts string parcel ids', () => {
    expect(parcelsToAdd([{ id: 'a' }], ['a', 'b']).map((p) => p.id)).toEqual(['b'])
  })

  it('returns empty for non-array or empty incoming', () => {
    expect(parcelsToAdd([{ id: 'a' }], null)).toEqual([])
    expect(parcelsToAdd([{ id: 'a' }], [])).toEqual([])
  })
})
