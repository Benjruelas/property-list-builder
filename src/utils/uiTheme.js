/** @typedef {'dark' | 'light' | 'glass'} UiTheme */

export const UI_THEME_DARK = 'dark'
export const UI_THEME_LIGHT = 'light'
export const UI_THEME_GLASS = 'glass'
export const DEFAULT_UI_THEME = UI_THEME_DARK

export const UI_THEME_OPTIONS = [
  { value: UI_THEME_DARK, label: 'Dark' },
  { value: UI_THEME_LIGHT, label: 'Light' },
  { value: UI_THEME_GLASS, label: 'Glass' },
]

/** @param {string | undefined | null} value */
export function normalizeUiTheme(value) {
  if (value === UI_THEME_LIGHT) return UI_THEME_LIGHT
  if (value === UI_THEME_GLASS) return UI_THEME_GLASS
  return UI_THEME_DARK
}

/** Browser / PWA top chrome color for the active UI theme. */
function themeColorForUiTheme(theme) {
  return theme === UI_THEME_LIGHT ? '#ffffff' : '#000000'
}

/** Keep meta theme-color in sync with the app plate (avoids navy/blue status strip). */
function applyThemeColorMeta(theme) {
  if (typeof document === 'undefined') return
  const color = themeColorForUiTheme(theme)
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)
}

/** @param {UiTheme} theme */
export function applyUiTheme(theme) {
  if (typeof document === 'undefined') return
  const next = normalizeUiTheme(theme)
  document.documentElement.dataset.uiTheme = next
  applyThemeColorMeta(next)
}

/** @param {Record<string, unknown> | null | undefined} settings */
export function getUiThemeFromSettings(settings) {
  return normalizeUiTheme(/** @type {string | undefined} */ (settings?.uiTheme))
}

/** Read theme from localStorage before React boots (avoids flash). */
export function applyUiThemeFromStorage() {
  try {
    const raw = localStorage.getItem('app_settings')
    if (raw) {
      const saved = JSON.parse(raw)
      applyUiTheme(normalizeUiTheme(saved.uiTheme))
      return
    }
  } catch { /* ignore */ }
  applyUiTheme(DEFAULT_UI_THEME)
}
