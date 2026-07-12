import { describe, it, expect } from 'vitest'
import { dedupePipelinesById, consolidateRedundantDefaultPipelines, normalizePipelineList } from '../pipelines'

describe('pipelines normalization', () => {
  it('dedupePipelinesById keeps the newest row per id', () => {
    const result = dedupePipelinesById([
      { id: 'p1', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p1', title: 'New', updatedAt: '2026-02-01T00:00:00.000Z' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('New')
  })

  it('consolidateRedundantDefaultPipelines drops extra empty default pipelines per owner', () => {
    const result = consolidateRedundantDefaultPipelines([
      { id: 'p1', ownerId: 'u1', title: 'Deal Pipeline', deals: [], updatedAt: '2026-02-01T00:00:00.000Z' },
      { id: 'p2', ownerId: 'u1', title: 'Pipes', deals: [], updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p3', ownerId: 'u1', title: 'Sales', deals: [{ id: 'd1' }], updatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
  })

  it('normalizePipelineList matches consolidateRedundantDefaultPipelines', () => {
    const input = [
      { id: 'p1', ownerId: 'u1', title: 'Deal Pipeline', deals: [], updatedAt: '2026-02-01T00:00:00.000Z' },
      { id: 'p2', ownerId: 'u1', title: 'Deal Pipeline', deals: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    ]
    expect(normalizePipelineList(input)).toEqual(consolidateRedundantDefaultPipelines(input))
  })
})
