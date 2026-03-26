import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { subscribeToWebPush } from '../utils/pushNotifications'
import { getSettings, updateSettings } from '../utils/settings'

const LS_KEY = 'notification_prompt_done'

function alreadyHandled() {
  try { return localStorage.getItem(LS_KEY) === '1' } catch { return false }
}

function markHandled() {
  try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }
}

/**
 * Lightweight overlay shown once (after location/orientation prompt is done) to
 * ask for Notification permission. Dismissed permanently via localStorage flag.
 */
export function NotificationPrompt({ getToken }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (alreadyHandled()) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      markHandled()
      return
    }
    setVisible(true)
  }, [])

  if (!visible) return null

  async function handleEnable() {
    markHandled()
    try {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        const next = updateSettings(
          { notifications: { ...getSettings().notifications, pushEnabled: true } },
          getToken
        )
        // Settings state is synced via the shared localStorage key; App picks it up on next read.
        void next
        if (typeof getToken === 'function') {
          try { await subscribeToWebPush(getToken) } catch { /* ignore */ }
        }
      }
    } catch { /* denied or unsupported */ }
    setVisible(false)
  }

  function handleSkip() {
    markHandled()
    setVisible(false)
  }

  const ui = (
    <div className="permission-prompt-overlay">
      <div className="permission-prompt-card">
        <div className="permission-prompt-icons">
          <div className="permission-prompt-icon">
            <Bell className="h-8 w-8" />
          </div>
        </div>
        <h2 className="permission-prompt-title">Enable Notifications</h2>
        <p className="permission-prompt-desc">
          Get notified when lists or pipelines are shared with you, when leads move stages, when skip traces finish, and when task deadlines are coming up.
        </p>
        <button
          type="button"
          className="permission-prompt-btn"
          onClick={handleEnable}
        >
          Enable
        </button>
        <button
          type="button"
          className="permission-prompt-skip-btn"
          onClick={handleSkip}
        >
          Not now
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : null
}
