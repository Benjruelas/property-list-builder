import { scheduleUserDataSync } from './userDataSync'
import { DEFAULT_UI_THEME, normalizeUiTheme } from './uiTheme'

const LS_KEY = 'app_settings'

export const DEFAULT_SETTINGS = {
  /** 'dark' | 'light' | 'glass' — panel chrome and map control colors (default: dark) */
  uiTheme: DEFAULT_UI_THEME,

  mapStyle: 'satellite',       // 'satellite' | 'street' | 'hybrid'
  defaultZoom: 17,             // 14–19
  compassDefault: false,
  autoFollow: true,

  parcelBoundaryColor: '#2563eb', // hex color for parcel outlines
  parcelBoundaryOpacity: 80,      // 0–100

  pathSmoothing: 'normal',     // 'off' | 'light' | 'normal' | 'heavy'
  distanceUnit: 'miles',       // 'miles' | 'km'

  defaultEmail: '',            // blank = use real recipient
  emailTestMode: false,
  emailSignatureEnabled: false,
  emailSignature: '',

  tourCompleted: false,

  /** Your name on outbound quote/form emails (synced to server for email templates). */
  profile: {
    displayName: '',
  },

  /** Push (server) + local notification preferences; synced in appSettings blob */
  notifications: {
    pushEnabled: false,
    deviceAlertsEnabled: true,
    itemShared: true,
    listShared: true,
    pipelineShared: true,
    pipelineLeadStage: true,
    pathShared: true,
    formSubmitted: true,
    teamAdded: true,
    skipTraceComplete: true,
    skipTraceFailed: true,
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

  /** Default email/text templates when sending quotes */
  quoteSendTemplates: null,

  /** Default email/text templates when sending photo reports */
  reportSendTemplates: null,

  /** Custom lead status labels/order (solo users without a team) */
  leadStatuses: null,

  /** Custom deal status labels/order (solo users without a team) */
  dealStatuses: null,
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
      if (saved.profile && typeof saved.profile === 'object') {
        merged.profile = { ...DEFAULT_SETTINGS.profile, ...saved.profile }
      }
      if (saved.reportBranding && typeof saved.reportBranding === 'object') {
        merged.reportBranding = { ...DEFAULT_SETTINGS.reportBranding, ...saved.reportBranding }
      }
      if (saved.quoteSendTemplates && typeof saved.quoteSendTemplates === 'object') {
        merged.quoteSendTemplates = saved.quoteSendTemplates
      }
      if (saved.reportSendTemplates && typeof saved.reportSendTemplates === 'object') {
        merged.reportSendTemplates = saved.reportSendTemplates
      }
      if (Array.isArray(saved.leadStatuses)) {
        merged.leadStatuses = saved.leadStatuses
      }
      if (Array.isArray(saved.dealStatuses)) {
        merged.dealStatuses = saved.dealStatuses
      }
      if (!Object.prototype.hasOwnProperty.call(saved, 'uiTheme')) {
        merged.uiTheme = DEFAULT_UI_THEME
      } else {
        merged.uiTheme = normalizeUiTheme(merged.uiTheme)
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
  if (partial.profile && typeof partial.profile === 'object') {
    next = {
      ...next,
      profile: { ...current.profile, ...partial.profile },
    }
  }
  if (partial.reportBranding && typeof partial.reportBranding === 'object') {
    next = {
      ...next,
      reportBranding: { ...current.reportBranding, ...partial.reportBranding }
    }
  }
  if (partial.quoteSendTemplates && typeof partial.quoteSendTemplates === 'object') {
    next = { ...next, quoteSendTemplates: partial.quoteSendTemplates }
  }
  if (partial.reportSendTemplates && typeof partial.reportSendTemplates === 'object') {
    next = { ...next, reportSendTemplates: partial.reportSendTemplates }
  }
  if (partial.leadStatuses !== undefined) {
    next = { ...next, leadStatuses: partial.leadStatuses }
  }
  if (partial.dealStatuses !== undefined) {
    next = { ...next, dealStatuses: partial.dealStatuses }
  }
  next.uiTheme = normalizeUiTheme(next.uiTheme)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  if (getToken) scheduleUserDataSync(getToken)
  return next
}
