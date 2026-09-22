import { Capacitor } from '@capacitor/core'

/**
 * Prevent the iOS WKWebView from shrinking when the software keyboard opens.
 * Default Capacitor behavior (resize: native) resizes the WebView so
 * `position: fixed; bottom: 0` chrome (action bar) rides up above the keyboard.
 */
export async function initCapacitorKeyboard() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
  } catch {
    // Plugin missing or unsupported platform — web/PWA path still applies.
  }
}
