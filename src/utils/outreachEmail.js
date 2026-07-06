import { getApiBase } from './apiBase'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * Send a lead/parcel outreach email through the app.
 * @param {() => Promise<string|null>} getToken
 * @param {{
 *   recipientEmail: string,
 *   cc?: string[],
 *   subject?: string,
 *   message?: string,
 *   sendMeCopy?: boolean,
 *   attachments?: Array<{ filename: string, contentBase64: string, contentType?: string }>,
 *   leadId?: string,
 * }} payload
 */
export async function sendOutreachEmail(getToken, payload) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')

  const res = await fetch(`${getApiBase()}/outreach-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await parseJsonSafe(res)
  if (!res.ok) {
    throw new Error(data.message || data.error || `Failed to send email (${res.status})`)
  }
  return data
}
