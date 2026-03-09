/**
 * App settings - stored in localStorage, synced when signed in
 */

const STORAGE_KEY = 'app_settings'

const DEFAULTS = {
  compassOnByDefault: false,
  showCompletedTasksByDefault: false,
  pushNotificationsEnabled: false,
  pushExportReady: true,
  pushListShared: true,
  pushPipelineShared: true,
  pushTaskReminders: true,
}

export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULTS }
    const parsed = JSON.parse(stored)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(updates) {
  try {
    const current = getSettings()
    const merged = { ...current, ...updates }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    return merged
  } catch (e) {
    console.error('Error saving settings:', e)
    return getSettings()
  }
}
