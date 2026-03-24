import { scheduleUserDataSync } from './userDataSync'

const LS_KEY = 'app_settings'

export const DEFAULT_SETTINGS = {
  mapStyle: 'satellite',       // 'satellite' | 'street' | 'hybrid'
  defaultZoom: 17,             // 14–19
  compassDefault: true,
  autoFollow: true,
  followResumeDelay: 5000,     // ms, 0 = never

  pathSmoothing: 'normal',     // 'off' | 'light' | 'normal' | 'heavy'
  distanceUnit: 'miles',       // 'miles' | 'km'

  defaultEmail: '',            // blank = use real recipient
  emailTestMode: false,
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...saved }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function updateSettings(partial, getToken) {
  const current = getSettings()
  const next = { ...current, ...partial }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  if (getToken) scheduleUserDataSync(getToken)
  return next
}
