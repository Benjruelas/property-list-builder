import { useState, useEffect } from 'react'
import { Settings, Compass, LayoutList, Mail, MessageSquare, Bell, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { cn } from '@/lib/utils'
import { getSettings, saveSettings } from '@/utils/settings'
import { showToast } from './ui/toast'
import { usePushNotifications, isPushSupported } from '../hooks/usePushNotifications'
import { syncPushPreferences } from '@/utils/userDataSync'

function PushNotificationsSection({ currentUser, getAuthToken, settings, onSettingsChange, showToast }) {
  const enabled = settings.pushNotificationsEnabled ?? false
  const exportReady = settings.pushExportReady ?? true
  const listShared = settings.pushListShared ?? true
  const pipelineShared = settings.pushPipelineShared ?? true
  const taskReminders = settings.pushTaskReminders ?? true

  const { supported, configured, error, loading, enablePush, disablePush } = usePushNotifications({
    currentUser,
    getAuthToken,
    isDev: import.meta.env.DEV,
    enabled
  })

  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  const handleMasterToggle = (checked) => {
    if (checked && supported && configured) {
      enablePush().then((ok) => {
        if (ok) {
          onSettingsChange({ pushNotificationsEnabled: true })
          showToast?.('Push notifications enabled', 'success')
          syncPushPreferences(getAuthToken)
        } else {
          onSettingsChange({ pushNotificationsEnabled: false })
          syncPushPreferences(getAuthToken)
        }
      })
    } else {
      onSettingsChange({ pushNotificationsEnabled: false })
      if (supported && configured) {
        disablePush()
      }
      syncPushPreferences(getAuthToken)
    }
  }

  const handleOptionChange = (key, checked) => {
    onSettingsChange({ [key]: checked })
    syncPushPreferences(getAuthToken)
  }

  if (!supported) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium">Push notifications require a secure connection (HTTPS)</p>
        <p className="text-xs text-gray-500">
          Open this app via your deployed URL (e.g. your Vercel domain) on mobile. Local dev or HTTP addresses do not support push.
        </p>
      </div>
    )
  }
  if (!configured) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium">Push notifications are not configured</p>
        <p className="text-xs text-gray-500">
          Add <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">VITE_FIREBASE_VAPID_KEY</code> to <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">.env.local</code>. Get it from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates. Restart the dev server after adding.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Enable push notifications</span>
        <Switch
          checked={enabled && !denied}
          onChange={handleMasterToggle}
          disabled={loading}
          className={loading && 'opacity-60'}
        />
      </label>

      {denied && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Notifications were denied. Enable them in your browser&apos;s site settings to receive push alerts.
        </p>
      )}

      {enabled && !denied && (
        <div className="pl-1 space-y-3 border-l-2 border-amber-500/40 ml-1">
          <p className="text-xs text-gray-600 dark:text-gray-400">Notify me when:</p>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Export ready</span>
            <Switch checked={exportReady} onChange={(v) => handleOptionChange('pushExportReady', v)} />
          </label>
          <p className="text-xs text-gray-500 -mt-2">When your list export is sent to your email</p>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">List shared with me</span>
            <Switch checked={listShared} onChange={(v) => handleOptionChange('pushListShared', v)} />
          </label>
          <p className="text-xs text-gray-500 -mt-2">When someone shares a list with you</p>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Pipeline shared with me</span>
            <Switch checked={pipelineShared} onChange={(v) => handleOptionChange('pushPipelineShared', v)} />
          </label>
          <p className="text-xs text-gray-500 -mt-2">When someone shares a deal pipeline with you</p>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Task reminders</span>
            <Switch checked={taskReminders} onChange={(v) => handleOptionChange('pushTaskReminders', v)} />
          </label>
          <p className="text-xs text-gray-500 -mt-2">When a scheduled task is due in the next hour</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function SettingsPanel({ isOpen, onClose, onCompassDefaultChange, onShowCompletedTasksDefaultChange, currentUser, getAuthToken }) {
  const [settings, setSettings] = useState(getSettings())

  useEffect(() => {
    if (isOpen) {
      setSettings(getSettings())
    }
  }, [isOpen])

  const handleCompassChange = (checked) => {
    const updated = saveSettings({ compassOnByDefault: checked })
    setSettings(updated)
    onCompassDefaultChange?.(checked)
    showToast('Compass setting saved', 'success')
  }

  const handleShowCompletedTasksChange = (checked) => {
    const updated = saveSettings({ showCompletedTasksByDefault: checked })
    setSettings(updated)
    onShowCompletedTasksDefaultChange?.(checked)
    showToast('Deal pipeline setting saved', 'success')
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent
        className={cn(
          "map-panel max-w-md flex flex-col p-0 gap-0 max-h-[90vh]",
          "max-md:inset-0 max-md:left-0 max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:max-w-none max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:rounded-none",
          "max-md:!border-0 max-md:!shadow-none"
        )}
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-3 md:px-6 max-md:pt-[calc(env(safe-area-inset-top,0px)+1rem)] max-md:px-4 max-md:pr-12 relative">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            App preferences for map, deal pipeline, and notifications
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="settings-close-btn absolute top-4 right-4 md:right-6 max-md:top-[calc(env(safe-area-inset-top,0px)+1rem)]"
            title="Close"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide px-4 md:px-6">
        <div className="space-y-6 py-2 pb-4">
          {/* Map */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/95 mb-3 flex items-center gap-2">
              <Compass className="h-4 w-4" />
              Map
            </h3>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Compass on by default
              </span>
              <Switch checked={settings.compassOnByDefault} onChange={handleCompassChange} />
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Start with map oriented to your direction when opening the app
            </p>
          </section>

          {/* Pipelines */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/95 mb-3 flex items-center gap-2">
              <LayoutList className="h-4 w-4" />
              Pipelines
            </h3>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Show completed tasks by default
              </span>
              <Switch checked={settings.showCompletedTasksByDefault} onChange={handleShowCompletedTasksChange} />
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Task list shows completed tasks when opening Pipelines
            </p>
          </section>

          {/* Push notifications */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/95 mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Push notifications
            </h3>
            <PushNotificationsSection
              currentUser={currentUser}
              getAuthToken={getAuthToken}
              settings={settings}
              onSettingsChange={(updates) => setSettings(saveSettings(updates))}
              showToast={showToast}
            />
          </section>

          {/* Task reminders - placeholder for future email/SMS */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/95 mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Task reminders
            </h3>
            <div className="space-y-3 rounded-lg border border-white/20 p-3 bg-black/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/95 flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  Email notifications
                </span>
                <span className="text-xs text-amber-400 font-medium">Coming soon</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/95 flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  SMS notifications
                </span>
                <span className="text-xs text-amber-400 font-medium">Coming soon</span>
              </div>
              <p className="text-xs text-white/80 pt-1">
                Get reminded about scheduled tasks via email or text message
              </p>
            </div>
          </section>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
