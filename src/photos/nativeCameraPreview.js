/**
 * Capacitor Camera Preview wrapper for native still capture.
 * On web this module reports unavailable so callers fall back to getUserMedia.
 */

import { isNativeApp } from '@/utils/apiBase'

export const NATIVE_CAMERA_BODY_CLASS = 'photo-native-camera-active'

let CameraPreview = null
let started = false
let activeFacing = 'rear'

async function loadPlugin() {
  if (CameraPreview) return CameraPreview
  if (!isNativeApp()) return null
  try {
    const mod = await import('@capacitor-community/camera-preview')
    CameraPreview = mod.CameraPreview
    return CameraPreview
  } catch {
    return null
  }
}

export function isNativeCameraPreviewAvailable() {
  return isNativeApp()
}

function setNativeCameraChromeActive(active) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(NATIVE_CAMERA_BODY_CLASS, !!active)
  document.body?.classList.toggle(NATIVE_CAMERA_BODY_CLASS, !!active)
}

function viewportSize() {
  const w = Math.round(window.innerWidth || window.screen?.width || 0)
  const h = Math.round(window.innerHeight || window.screen?.height || 0)
  return { width: Math.max(1, w), height: Math.max(1, h) }
}

function toDataUrl(base64) {
  if (!base64) return null
  if (typeof base64 === 'string' && base64.startsWith('data:')) return base64
  return `data:image/jpeg;base64,${base64}`
}

/**
 * Start native camera preview behind the WebView.
 * @param {{ position?: 'rear' | 'front', enableHighResolution?: boolean }} [opts]
 * @returns {Promise<boolean>} true if native preview started
 */
export async function startNativeCameraPreview(opts = {}) {
  const plugin = await loadPlugin()
  if (!plugin) return false

  const position = opts.position === 'front' ? 'front' : 'rear'
  const { width, height } = viewportSize()

  if (started) {
    try {
      await plugin.stop()
    } catch {
      /* already stopped */
    }
    started = false
  }

  setNativeCameraChromeActive(true)

  try {
    await plugin.start({
      position,
      toBack: true,
      disableAudio: true,
      enableHighResolution: opts.enableHighResolution !== false,
      enableZoom: true,
      rotateWhenOrientationChanged: true,
      x: 0,
      y: 0,
      width,
      height,
    })
    started = true
    activeFacing = position
    return true
  } catch (err) {
    setNativeCameraChromeActive(false)
    started = false
    throw err
  }
}

/**
 * Stop native preview and restore opaque WebView chrome.
 */
export async function stopNativeCameraPreview() {
  const plugin = CameraPreview || (await loadPlugin())
  setNativeCameraChromeActive(false)
  if (!plugin || !started) {
    started = false
    return
  }
  try {
    await plugin.stop()
  } catch {
    /* ignore stop races */
  } finally {
    started = false
  }
}

export function isNativeCameraPreviewStarted() {
  return started
}

export function getNativeCameraFacing() {
  return activeFacing
}

/**
 * Capture a still via AVCapturePhotoOutput / CameraX (system shutter on iOS).
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<string|null>} JPEG data URL
 */
export async function captureNativeStill(opts = {}) {
  const plugin = CameraPreview || (await loadPlugin())
  if (!plugin || !started) return null
  const quality = Number.isFinite(opts.quality) ? opts.quality : 92
  const result = await plugin.capture({ quality })
  return toDataUrl(result?.value)
}

export async function flipNativeCamera() {
  const plugin = CameraPreview || (await loadPlugin())
  if (!plugin || !started) return false
  await plugin.flip()
  activeFacing = activeFacing === 'rear' ? 'front' : 'rear'
  return true
}

/**
 * @param {'off' | 'on' | 'auto' | 'torch'} mode
 */
export async function setNativeFlashMode(mode) {
  const plugin = CameraPreview || (await loadPlugin())
  if (!plugin || !started) return false
  try {
    await plugin.setFlashMode({ flashMode: mode })
    return true
  } catch {
    return false
  }
}

/**
 * Restart preview at current viewport size (after rotate / resize).
 */
export async function resizeNativeCameraPreview() {
  if (!started) return false
  const facing = activeFacing
  return startNativeCameraPreview({ position: facing })
}

/** Test helpers */
export function __resetNativeCameraPreviewStateForTests() {
  started = false
  activeFacing = 'rear'
  CameraPreview = null
  setNativeCameraChromeActive(false)
}

export function __setCameraPreviewPluginForTests(plugin) {
  CameraPreview = plugin
}
