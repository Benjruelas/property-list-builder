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

  tourCompleted: false,

  /** Push (server) + local notification preferences; synced in appSettings blob */
  notifications: {
    pushEnabled: false,
    listShared: true,
    pipelineShared: true,
    pipelineLeadStage: true,
    skipTraceComplete: true,
    taskDeadline: true,
    /** Minutes before scheduled time to fire reminder */
    taskDeadlineLeadMinutes: 60,
  },

  /** Branding fields embedded in generated roof measurement PDFs */
  reportBranding: {
    companyName: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    logoBase64: '',
  },
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const merged = { ...DEFAULT_SETTINGS, ...saved }
      if (saved.notifications && typeof saved.notifications === 'object') {
        merged.notifications = { ...DEFAULT_SETTINGS.notifications, ...saved.notifications }
      }
      if (saved.reportBranding && typeof saved.reportBranding === 'object') {
        merged.reportBranding = { ...DEFAULT_SETTINGS.reportBranding, ...saved.reportBranding }
      }
      return merged
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function updateSettings(partial, getToken) {
  const current = getSettings()
  let next = { ...current, ...partial }
  if (partial.notifications && typeof partial.notifications === 'object') {
    next = {
      ...next,
      notifications: { ...current.notifications, ...partial.notifications }
    }
  }
  if (partial.reportBranding && typeof partial.reportBranding === 'object') {
    next = {
      ...next,
      reportBranding: { ...current.reportBranding, ...partial.reportBranding }
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  if (getToken) scheduleUserDataSync(getToken)
  return next
}
