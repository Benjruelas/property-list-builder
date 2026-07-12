import { describe, it, expect } from 'vitest'
import { packBlockHeights } from '../pdfPagePack.js'

describe('packBlockHeights', () => {
  it('keeps blocks on one page when they fit', () => {
    expect(packBlockHeights([100, 200, 300], 700)).toEqual([[0, 1, 2]])
  })

  it('moves overflow blocks to the next page', () => {
    expect(packBlockHeights([400, 400, 100], 500)).toEqual([[0], [1, 2]])
  })

  it('fills pages greedily before opening a new one', () => {
    expect(packBlockHeights([200, 200, 200, 50], 450)).toEqual([[0, 1], [2, 3]])
  })

  it('still places an oversized first block alone', () => {
    expect(packBlockHeights([900, 100], 500)).toEqual([[0], [1]])
  })
})
