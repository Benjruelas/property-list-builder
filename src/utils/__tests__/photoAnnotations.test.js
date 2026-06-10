import { describe, it, expect } from 'vitest'
import { normalizeAnnotationObjects, serializeAnnotationLayer } from '../photoAnnotations'

describe('photoAnnotations', () => {
  it('normalizes missing ids on annotation objects', () => {
    const result = normalizeAnnotationObjects([
      { type: 'rect', x: 1 },
      { id: 'custom', type: 'circle' },
    ])
    expect(result[0].id).toBe('obj_0')
    expect(result[1].id).toBe('custom')
  })

  it('serializes annotation layer with version', () => {
    const layer = serializeAnnotationLayer([{ type: 'line', points: [0, 0, 10, 10] }])
    expect(layer.version).toBe(1)
    expect(layer.objects).toHaveLength(1)
    expect(layer.objects[0].id).toBe('obj_0')
  })
})
