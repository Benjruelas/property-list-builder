/**
 * Mint owner preview links that open the public client-facing quote/report pages.
 */

export const CLIENT_PREVIEW_RETURN_KEY = 'clientPreviewReturnUrl'

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/** Remember where the user was before opening a client preview. */
export function markClientPreviewOpened() {
  if (typeof sessionStorage === 'undefined') return
  const path = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : '/'
  sessionStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, path)
}

/** True only for owner "View as client" previews — not real client share links. */
export function shouldShowOwnerPreviewBack({ preview = false } = {}) {
  return preview === true
}

/** Leave the public quote/report page and restore the CRM session. */
export function returnToAppFromClientPreview() {
  if (typeof window === 'undefined') return

  const stored = sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)
  sessionStorage.removeItem(CLIENT_PREVIEW_RETURN_KEY)

  if (stored) {
    try {
      const storedUrl = new URL(stored, window.location.origin)
      const current = new URL(window.location.href)
      if (storedUrl.href !== current.href) {
        window.location.href = storedUrl.pathname + storedUrl.search + storedUrl.hash
        return
      }
    } catch {
      /* fall through */
    }
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('quote')
  url.searchParams.delete('report')
  url.searchParams.delete('payment')
  const next = url.pathname + url.search + url.hash
  window.location.href = next && next !== '?' ? next : '/'
}

/**
 * @param {() => Promise<string|null>} getToken
 * @param {{ type: 'quote' | 'report', id: string }} params
 * @returns {Promise<string>} publicUrl
 */
export async function fetchClientPreviewUrl(getToken, { type, id }) {
  const token = await getToken?.()
  if (!token) throw new Error('Sign in required')
  if (!type || !id) throw new Error('type and id are required')

  const res = await fetch(`${getApiBase()}/client-preview-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, id }),
  })
  const data = await parseJsonSafe(res)
  if (!res.ok) throw new Error(data.error || 'Failed to create preview link')
  if (!data.publicUrl) throw new Error('Preview link missing from response')
  return data.publicUrl
}

/** Open a blank tab synchronously during the user click (before any await). */
export function prepareClientPreviewTab() {
  if (typeof window === 'undefined') return null
  markClientPreviewOpened()
  // Do not pass noopener — the opener must navigate this tab after async work.
  return window.open('about:blank', '_blank')
}

export function closeClientPreviewTab(previewWindow) {
  try {
    previewWindow?.close()
  } catch {
    /* ignore */
  }
}

export function openClientPreviewUrl(publicUrl, previewWindow = null) {
  if (!publicUrl || typeof window === 'undefined') return false
  markClientPreviewOpened()
  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.href = publicUrl
      try {
        previewWindow.opener = null
      } catch {
        /* ignore */
      }
      return true
    } catch {
      /* fall through to window.open */
    }
  }
  const opened = window.open(publicUrl, '_blank', 'noopener,noreferrer')
  return !!opened
}
