/**
 * Mint owner preview links that open the public client-facing quote/report pages.
 */

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

export function openClientPreviewUrl(publicUrl) {
  if (!publicUrl || typeof window === 'undefined') return
  window.open(publicUrl, '_blank', 'noopener,noreferrer')
}
