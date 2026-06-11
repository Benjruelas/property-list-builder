import { useState, useRef } from 'react'
import { Building2, ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { showToast } from './ui/toast'
import { updateTeamSettings } from '@/utils/teams'
import { getTeamEmailBranding, readLogoFileAsDataUrl } from '@/utils/profile'
import { FilePreviewOverlay } from './ui/FilePreviewOverlay'

export function TeamEmailBrandingSection({ team, getToken, onSaved, disabled }) {
  const initial = getTeamEmailBranding(team)
  const [businessName, setBusinessName] = useState(initial.businessName)
  const [companyPhone, setCompanyPhone] = useState(initial.companyPhone)
  const [companyWebsite, setCompanyWebsite] = useState(initial.companyWebsite)
  const [companyEmail, setCompanyEmail] = useState(initial.companyEmail)
  const [logoBase64, setLogoBase64] = useState(initial.logoBase64)
  const [saving, setSaving] = useState(false)
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false)
  const fileRef = useRef(null)

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readLogoFileAsDataUrl(file)
      setLogoBase64(dataUrl)
    } catch (err) {
      showToast(err.message || 'Could not load image', 'error')
    }
  }

  const handleSave = async () => {
    const name = businessName.trim()
    if (!name) {
      showToast('Business name is required', 'error')
      return
    }
    setSaving(true)
    try {
      await updateTeamSettings(getToken, team.id, {
        emailBranding: {
          businessName: name,
          companyPhone: companyPhone.trim(),
          companyWebsite: companyWebsite.trim(),
          companyEmail: companyEmail.trim(),
          logoBase64,
        },
      })
      showToast('Business branding saved', 'success')
      await onSaved?.()
    } catch (err) {
      showToast(err.message || 'Failed to save branding', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5 rounded-md border border-white/10 p-3 bg-black/10">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client emails</p>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Logo and business name appear on quote and form emails your team sends to clients.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Business name</label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Roofing"
            maxLength={120}
            disabled={disabled || saving}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Logo</label>
          <div className="flex items-center gap-3">
            {logoBase64 ? (
              <div className="relative shrink-0 rounded-md border border-white/15 bg-white/5 p-2">
                <button
                  type="button"
                  className="block"
                  onClick={() => setLogoPreviewOpen(true)}
                  title="Preview logo"
                >
                  <img src={logoBase64} alt="" className="h-10 max-w-[120px] object-contain" />
                </button>
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 border border-white/20 flex items-center justify-center"
                  onClick={() => setLogoBase64('')}
                  disabled={disabled || saving}
                  aria-label="Remove logo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-14 w-24 rounded-md border border-dashed border-white/20 flex items-center justify-center text-[10px] text-gray-500">
                No logo
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoPick} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || saving}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4 mr-1" />
              Upload
            </Button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Business email (optional)</label>
          <Input
            type="email"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            placeholder="hello@yourcompany.com"
            disabled={disabled || saving}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Phone (optional)</label>
            <Input
              type="tel"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              placeholder="(555) 123-4567"
              disabled={disabled || saving}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Website (optional)</label>
            <Input
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="yourcompany.com"
              disabled={disabled || saving}
            />
          </div>
        </div>
        <Button type="button" size="sm" className="w-full" disabled={disabled || saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save branding
        </Button>
      </div>

      <FilePreviewOverlay
        open={logoPreviewOpen && !!logoBase64}
        onClose={() => setLogoPreviewOpen(false)}
        items={logoBase64 ? [{
          id: 'team-logo',
          name: 'Team logo',
          contentType: 'image/png',
          loadBlob: async () => logoBase64,
        }] : []}
        initialIndex={0}
      />
    </div>
  )
}
