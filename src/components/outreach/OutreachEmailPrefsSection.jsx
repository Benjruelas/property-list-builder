import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="settings-toggle relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200"
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full transition-all duration-200',
          checked ? 'translate-x-[24px] toggle-knob-on' : 'translate-x-[4px] toggle-knob-off',
        )}
      />
    </button>
  )
}

function SettingRow({ label, description, children, stacked }) {
  if (stacked) {
    return (
      <div>
        <div className="mb-2">
          <div className="text-sm font-medium">{label}</div>
          {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

/** Email delivery prefs moved from Settings → Outreach. */
export function OutreachEmailPrefsSection({ settings = {}, onUpdate }) {
  const s = settings
  const update = (patch) => onUpdate?.(patch)

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4 opacity-70" />
        Email delivery
      </div>
      <SettingRow label="Email test mode" description="Route all emails to the address below instead of real recipients">
        <Toggle checked={!!s.emailTestMode} onChange={(v) => update({ emailTestMode: v })} />
      </SettingRow>
      <div>
        <label className="block text-sm font-medium mb-1">Test email address</label>
        <p className="text-xs opacity-50 mb-1.5">Used when test mode is on, or for CSV exports</p>
        <input
          type="email"
          value={s.defaultEmail || ''}
          onChange={(e) => update({ defaultEmail: e.target.value })}
          placeholder="your@email.com"
          className="w-full text-sm rounded-lg px-3 py-2 border border-white/15 bg-white/5"
        />
      </div>
      <SettingRow label="Email signature" description="Append a signature to the end of outgoing emails">
        <Toggle checked={!!s.emailSignatureEnabled} onChange={(v) => update({ emailSignatureEnabled: v })} />
      </SettingRow>
      {s.emailSignatureEnabled && (
        <textarea
          value={s.emailSignature || ''}
          onChange={(e) => update({ emailSignature: e.target.value })}
          placeholder="e.g. Best regards,&#10;Your name"
          className="w-full text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y border border-white/15 bg-white/5"
          rows={3}
        />
      )}
    </section>
  )
}
