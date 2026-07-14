import { describe, expect, it } from 'vitest'
import { isPanelChunkLoaded, loadPanelChunk, panelLazy } from '../panelChunks'

describe('panelChunks', () => {
  it('tracks loaded panel chunks', async () => {
    const key = 'outreach'
    expect(isPanelChunkLoaded(key)).toBe(false)
    await loadPanelChunk(key)
    expect(isPanelChunkLoaded(key)).toBe(true)
    expect(panelLazy[key]).toBeTypeOf('function')
  })
})
