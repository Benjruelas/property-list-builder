import { getSettings } from './settings'

/** Display name for quotes/forms/outreach (settings override Firebase profile). */
export function getSenderDisplayName(currentUser, settings = null) {
  const s = settings || getSettings()
  const fromSettings = (s?.profile?.displayName || '').trim()
  if (fromSettings) return fromSettings
  const fromAuth = (currentUser?.displayName || '').trim()
  if (fromAuth) return fromAuth
  const email = currentUser?.email || ''
  if (email.includes('@')) return email.split('@')[0]
  return 'Your rep'
}

export function getTeamForMembership(teams, teamMembership) {
  if (!teamMembership?.teamId || !Array.isArray(teams)) return null
  return teams.find((t) => t.id === teamMembership.teamId) || null
}

export function getTeamEmailBranding(team) {
  const eb = team?.emailBranding || {}
  return {
    businessName: (eb.businessName || team?.name || '').trim(),
    companyPhone: (eb.companyPhone || '').trim(),
    companyWebsite: (eb.companyWebsite || '').trim(),
    companyEmail: (eb.companyEmail || '').trim(),
    logoBase64: eb.logoBase64 || '',
  }
}

/** Featured Google reviews payload for quote/report previews (from public team profile). */
export function getGoogleReviewsFromProfile(profile) {
  const gbp = profile?.googleBusinessProfile || profile
  if (!gbp?.connected) return null
  const reviews = Array.isArray(gbp.reviews) ? gbp.reviews : (gbp.reviewsCache || [])
  const byId = Object.fromEntries(reviews.map((r) => [r.id, r]).filter(([id]) => id))
  const featuredReviews = (gbp.featuredReviewIds || [])
    .map((id) => byId[id])
    .filter(Boolean)
    .slice(0, 3)
  if (!featuredReviews.length) return null
  return {
    averageRating: Number(gbp.averageRating) || 0,
    totalReviewCount: Number(gbp.totalReviewCount) || 0,
    featuredReviews,
  }
}

export function getCompanyNameForSends(teams, teamMembership, settings = null) {
  const team = getTeamForMembership(teams, teamMembership)
  const fromTeam = getTeamEmailBranding(team).businessName
  if (fromTeam) return fromTeam
  const s = settings || getSettings()
  return (s?.reportBranding?.companyName || '').trim() || 'KnockScout'
}

const MAX_LOGO_BYTES = 280_000

/**
 * Read an image file as a compressed data URL for team logo upload.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readLogoFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Choose a PNG or JPEG image'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image must be under 2 MB'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Invalid image'))
      img.onload = () => {
        const maxW = 400
        const scale = img.width > maxW ? maxW / img.width : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(String(reader.result))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        let dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        if (dataUrl.length > MAX_LOGO_BYTES) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.65)
        }
        if (dataUrl.length > MAX_LOGO_BYTES) {
          reject(new Error('Logo is too large after compression — use a smaller image'))
          return
        }
        resolve(dataUrl)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
