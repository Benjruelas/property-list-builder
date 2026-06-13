import { describe, it, expect } from 'vitest'
import {
  PATH_COLORS,
  colorAtIndex,
  buildPathColorMap,
  getPathColor,
  pathGlowFromColor,
  sortPathsForColorAssignment,
} from '../pathColors'

describe('pathColors', () => {
  it('assigns unique colors for every path', () => {
    const paths = Array.from({ length: 15 }, (_, i) => ({
      id: `path-${i}`,
      createdAt: new Date(2024, 0, i + 1).toISOString(),
    }))
    const map = buildPathColorMap(paths)
    const colors = [...map.values()]
    expect(colors).toHaveLength(15)
    expect(new Set(colors).size).toBe(15)
  })

  it('keeps stable color per path id as list grows', () => {
    const early = buildPathColorMap([
      { id: 'a', createdAt: '2024-01-01' },
      { id: 'b', createdAt: '2024-01-02' },
    ])
    const later = buildPathColorMap([
      { id: 'a', createdAt: '2024-01-01' },
      { id: 'b', createdAt: '2024-01-02' },
      { id: 'c', createdAt: '2024-01-03' },
    ])
    expect(later.get('a')).toBe(early.get('a'))
    expect(later.get('b')).toBe(early.get('b'))
  })

  it('uses palette for the first slots', () => {
    expect(colorAtIndex(0)).toBe(PATH_COLORS[0])
    expect(colorAtIndex(PATH_COLORS.length - 1)).toBe(PATH_COLORS[PATH_COLORS.length - 1])
  })

  it('sorts oldest paths first for color index', () => {
    const sorted = sortPathsForColorAssignment([
      { id: 'new', createdAt: '2024-06-01' },
      { id: 'old', createdAt: '2024-01-01' },
    ])
    expect(sorted.map((p) => p.id)).toEqual(['old', 'new'])
    const map = buildPathColorMap(sorted)
    expect(map.get('old')).toBe(colorAtIndex(0))
    expect(map.get('new')).toBe(colorAtIndex(1))
  })

  it('looks up color from map', () => {
    const map = buildPathColorMap([{ id: 'x', createdAt: '2024-01-01' }])
    expect(getPathColor('x', map)).toBe(map.get('x'))
  })

  it('builds glow from stroke color', () => {
    const hex = colorAtIndex(3)
    expect(pathGlowFromColor(hex)).toBe(`${hex}4D`)
  })
})
