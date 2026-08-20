/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/apiBase', () => ({
  isNativeApp: vi.fn(() => false),
}))

vi.mock('@capacitor-community/camera-preview', () => ({
  CameraPreview: {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    capture: vi.fn(async () => ({ value: 'abc123base64' })),
    flip: vi.fn(async () => {}),
    setFlashMode: vi.fn(async () => {}),
  },
}))

import { isNativeApp } from '@/utils/apiBase'
import {
  __resetNativeCameraPreviewStateForTests,
  __setCameraPreviewPluginForTests,
  captureNativeStill,
  flipNativeCamera,
  isNativeCameraPreviewAvailable,
  isNativeCameraPreviewStarted,
  NATIVE_CAMERA_BODY_CLASS,
  resizeNativeCameraPreview,
  setNativeFlashMode,
  startNativeCameraPreview,
  stopNativeCameraPreview,
} from '@/photos/nativeCameraPreview'

describe('nativeCameraPreview', () => {
  beforeEach(() => {
    __resetNativeCameraPreviewStateForTests()
    document.documentElement.className = ''
    document.body.className = ''
    vi.mocked(isNativeApp).mockReturnValue(false)
  })

  it('reports unavailable and skips start on web', async () => {
    expect(isNativeCameraPreviewAvailable()).toBe(false)
    await expect(startNativeCameraPreview()).resolves.toBe(false)
    expect(isNativeCameraPreviewStarted()).toBe(false)
    expect(document.documentElement.classList.contains(NATIVE_CAMERA_BODY_CLASS)).toBe(false)
  })

  it('starts, captures a data URL, flips, sets flash, and stops on native', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true)
    const plugin = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      capture: vi.fn(async () => ({ value: 'abc123base64' })),
      flip: vi.fn(async () => {}),
      setFlashMode: vi.fn(async () => {}),
    }
    __setCameraPreviewPluginForTests(plugin)

    await expect(startNativeCameraPreview({ position: 'rear' })).resolves.toBe(true)
    expect(plugin.start).toHaveBeenCalledWith(expect.objectContaining({
      position: 'rear',
      toBack: true,
      disableAudio: true,
      enableZoom: true,
      rotateWhenOrientationChanged: true,
    }))
    const startArg = plugin.start.mock.calls[0][0]
    expect(startArg.width).toBeGreaterThan(0)
    expect(startArg.height).toBeGreaterThan(0)
    expect(isNativeCameraPreviewStarted()).toBe(true)
    expect(document.documentElement.classList.contains(NATIVE_CAMERA_BODY_CLASS)).toBe(true)

    await expect(captureNativeStill({ quality: 90 })).resolves.toBe('data:image/jpeg;base64,abc123base64')
    expect(plugin.capture).toHaveBeenCalledWith({ quality: 90 })

    await expect(flipNativeCamera()).resolves.toBe(true)
    expect(plugin.flip).toHaveBeenCalled()

    await expect(setNativeFlashMode('on')).resolves.toBe(true)
    expect(plugin.setFlashMode).toHaveBeenCalledWith({ flashMode: 'on' })

    await stopNativeCameraPreview()
    expect(plugin.stop).toHaveBeenCalled()
    expect(isNativeCameraPreviewStarted()).toBe(false)
    expect(document.documentElement.classList.contains(NATIVE_CAMERA_BODY_CLASS)).toBe(false)
  })

  it('prefixes data URLs only when capture returns raw base64', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true)
    const plugin = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      capture: vi.fn(async () => ({ value: 'data:image/jpeg;base64,already' })),
      flip: vi.fn(async () => {}),
      setFlashMode: vi.fn(async () => {}),
    }
    __setCameraPreviewPluginForTests(plugin)
    await startNativeCameraPreview()
    await expect(captureNativeStill()).resolves.toBe('data:image/jpeg;base64,already')
  })

  it('does not restart the session on resizeNativeCameraPreview', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true)
    const plugin = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      capture: vi.fn(async () => ({ value: 'x' })),
      flip: vi.fn(async () => {}),
      setFlashMode: vi.fn(async () => {}),
    }
    __setCameraPreviewPluginForTests(plugin)
    await startNativeCameraPreview()
    await expect(resizeNativeCameraPreview()).resolves.toBe(true)
    expect(plugin.stop).not.toHaveBeenCalled()
    expect(plugin.start).toHaveBeenCalledTimes(1)
  })
})
