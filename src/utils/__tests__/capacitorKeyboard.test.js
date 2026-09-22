import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('initCapacitorKeyboard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('sets resize mode to none on native platforms', async () => {
    const setResizeMode = vi.fn(() => Promise.resolve())
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true },
    }))
    vi.doMock('@capacitor/keyboard', () => ({
      Keyboard: { setResizeMode },
      KeyboardResize: { None: 'none' },
    }))
    const { initCapacitorKeyboard } = await import('../capacitorKeyboard')
    await initCapacitorKeyboard()
    expect(setResizeMode).toHaveBeenCalledWith({ mode: 'none' })
  })

  it('no-ops on web', async () => {
    const setResizeMode = vi.fn(() => Promise.resolve())
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }))
    vi.doMock('@capacitor/keyboard', () => ({
      Keyboard: { setResizeMode },
      KeyboardResize: { None: 'none' },
    }))
    const { initCapacitorKeyboard } = await import('../capacitorKeyboard')
    await initCapacitorKeyboard()
    expect(setResizeMode).not.toHaveBeenCalled()
  })
})
