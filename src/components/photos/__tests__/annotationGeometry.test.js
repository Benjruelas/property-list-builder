import { describe, it, expect } from 'vitest'
import {
  getHandlePositions,
  applyMove,
  applyResize,
  createDefaultTextObject,
  fitTextObjectBounds,
  getMaxTextWidth,
  estimateTextBoxHeight,
  textDisplayLines,
  normalizeTextContent,
  DEFAULT_TEXT_FONT_SIZE,
  TEXT_MAX_WIDTH_RATIO,
  TEXT_SINGLE_LINE_MIN_WIDTH_RATIO,
  wrapTextLines,
  getTextLayoutLines,
} from '../annotationGeometry'

describe('annotationGeometry', () => {
  it('returns circle radius handle position', () => {
    const handles = getHandlePositions({ type: 'circle', x: 10, y: 20, radius: 15 })
    expect(handles).toEqual([{ id: 'radius', x: 40, y: 35 }])
  })

  it('returns rect corner handles', () => {
    const handles = getHandlePositions({ type: 'rect', x: 0, y: 0, width: 100, height: 50 })
    expect(handles).toHaveLength(4)
    expect(handles.find((h) => h.id === 'se')).toEqual({ id: 'se', x: 100, y: 50 })
  })

  it('returns line endpoint handles', () => {
    const handles = getHandlePositions({ type: 'line', points: [0, 0, 50, 50] })
    expect(handles).toEqual([
      { id: 'start', x: 0, y: 0 },
      { id: 'end', x: 50, y: 50 },
    ])
  })

  it('moves rect by delta', () => {
    const moved = applyMove({ type: 'rect', x: 1, y: 2, width: 10, height: 10 }, 5, -1)
    expect(moved).toMatchObject({ x: 6, y: 1 })
  })

  it('moves line points by delta', () => {
    const moved = applyMove({ type: 'line', points: [0, 0, 10, 10] }, 3, 4)
    expect(moved.points).toEqual([3, 4, 13, 14])
  })

  it('resizes circle radius from handle drag', () => {
    const obj = { type: 'circle', x: 0, y: 0, radius: 10 }
    const resized = applyResize(obj, 'radius', 40, 10)
    expect(resized.radius).toBe(30)
  })

  it('resizes rect southeast corner', () => {
    const obj = { type: 'rect', x: 0, y: 0, width: 20, height: 20 }
    const resized = applyResize(obj, 'se', 60, 40)
    expect(resized).toMatchObject({ x: 0, y: 0, width: 60, height: 40 })
  })

  it('proportionally resizes text from northwest corner', () => {
    const obj = { type: 'text', x: 10, y: 10, width: 150, height: 80, fontSize: 72, text: 'Hi' }
    const resized = applyResize(obj, 'nw', 20, 15)
    expect(resized.x).toBe(20)
    expect(resized.y).toBeCloseTo(15.333, 2)
    expect(resized.width).toBeCloseTo(140, 1)
    expect(resized.height).toBeCloseTo(74.667, 1)
    expect(resized.width / resized.height).toBeCloseTo(150 / 80, 5)
    expect(resized.fontSize).toBeCloseTo(67.2, 1)
  })

  it('keeps circle radius handle on pointer angle', () => {
    const obj = { type: 'circle', x: 0, y: 0, radius: 10 }
    const resized = applyResize(obj, 'radius', 10, 30)
    expect(resized.radius).toBeCloseTo(20, 5)
    expect(resized.radiusAngle).toBeCloseTo(Math.PI / 2, 5)
    const handles = getHandlePositions(resized)
    expect(handles[0].x).toBeCloseTo(10, 5)
    expect(handles[0].y).toBeCloseTo(30, 5)
  })

  it('resizes line end point', () => {
    const obj = { type: 'line', points: [0, 0, 10, 10] }
    const resized = applyResize(obj, 'end', 50, 5)
    expect(resized.points).toEqual([0, 0, 50, 5])
  })

  it('creates default text object fitted to content', () => {
    const obj = createDefaultTextObject({ id: 't1', x: 5, y: 6, fill: '#fff' })
    expect(obj).toMatchObject({ type: 'text', text: 'Text', fontSize: 72 })
    expect(obj.width).toBeGreaterThanOrEqual(120)
    expect(obj.height).toBeGreaterThanOrEqual(72)
  })

  it('starts single-line text wide and caps growth at 85% of photo width', () => {
    const imageWidth = 1000
    const maxWidth = getMaxTextWidth(imageWidth)
    expect(maxWidth).toBe(1000 * TEXT_MAX_WIDTH_RATIO)

    const initial = fitTextObjectBounds('Text', 72, maxWidth)
    expect(initial.width).toBe(maxWidth * TEXT_SINGLE_LINE_MIN_WIDTH_RATIO)

    const longLine = fitTextObjectBounds('A'.repeat(200), 72, maxWidth)
    expect(longLine.width).toBe(maxWidth)
    expect(longLine.height).toBeGreaterThan(72 * 1.2)
  })

  it('wraps overflowing single-line text within max width', () => {
    const maxWidth = getMaxTextWidth(1000)
    const lines = getTextLayoutLines('A'.repeat(200), 72, maxWidth)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('does not wrap short text in a wide box', () => {
    const maxWidth = getMaxTextWidth(1000)
    const bounds = fitTextObjectBounds('Hello World', 72, maxWidth)
    expect(getTextLayoutLines('Hello World', 72, bounds.width)).toEqual(['Hello World'])
    const oneLine = fitTextObjectBounds('Hello', 72, maxWidth)
    const twoLines = fitTextObjectBounds('Hello\nWorld', 72, maxWidth)
    expect(oneLine.height).toBeLessThan(twoLines.height)
  })

  it('fits text box to multiline content', () => {
    const bounds = fitTextObjectBounds('Hello\nWorld', 72)
    expect(bounds.width).toBeGreaterThan(120)
    expect(bounds.height).toBeGreaterThan(72 * 1.2)
  })

  it('preserves explicit newlines in display lines', () => {
    expect(textDisplayLines('hello\nworld')).toEqual(['hello', 'world'])
  })

  it('normalizes text without stripping internal newlines', () => {
    expect(normalizeTextContent('  line1\nline2  ')).toBe('  line1\nline2')
  })

  it('estimates text box height from wrapped lines', () => {
    const height = estimateTextBoxHeight('hello world from annotator', 40, 18)
    expect(height).toBeGreaterThanOrEqual(24)
  })

  it('resize from snapshot stays stable across repeated pointer samples', () => {
    const snapshot = { type: 'rect', x: 10, y: 10, width: 100, height: 50 }
    const first = applyResize(snapshot, 'nw', 20, 15)
    const second = applyResize(snapshot, 'nw', 20, 15)
    expect(first).toEqual(second)
    expect(first).toMatchObject({ x: 20, y: 15, width: 90, height: 45 })
  })
})
