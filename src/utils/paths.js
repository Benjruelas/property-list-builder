/**
 * User-scoped paths API. All methods require an async getToken() that returns Firebase ID token.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

export async function fetchPaths(getToken) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/paths`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch paths')
  const data = await res.json()
  return data.paths || []
}

export async function createPath(getToken, name, points, distanceMiles) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to save paths')
  const res = await fetch(`${getApiBase()}/paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, points, distanceMiles })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create path')
  }
  const data = await res.json()
  return data.path
}

export async function renamePath(getToken, pathId, name) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to rename paths')
  const res = await fetch(`${getApiBase()}/paths`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pathId, name })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to rename path')
  }
  const data = await res.json()
  return data.path
}

export async function deletePath(getToken, pathId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete paths')
  const res = await fetch(`${getApiBase()}/paths`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pathId })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete path')
  }
}
