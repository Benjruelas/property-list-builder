/**
 * Firebase Admin SDK — used for server-generated auth links (password reset).
 */

import admin from 'firebase-admin'

let initPromise = null

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    try {
      return JSON.parse(rawJson)
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON')
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT

  if (clientEmail && privateKey && projectId) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    }
  }

  return null
}

export function getAppOrigin() {
  const explicit =
    process.env.APP_ORIGIN ||
    process.env.VITE_APP_ORIGIN ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (explicit) return String(explicit).replace(/\/$/, '')
  return 'https://knockscout.app'
}

export async function getFirebaseAdminAuth() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (!admin.apps.length) {
      const serviceAccount = loadServiceAccount()
      if (!serviceAccount) {
        throw new Error(
          'Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
        )
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    }
    return admin.auth()
  })()

  return initPromise
}

/** Strip Firebase query noise; keep a short KnockScout URL with the oob code. */
export function simplifyPasswordResetLink(firebaseLink, origin = getAppOrigin()) {
  try {
    const url = new URL(firebaseLink)
    const oobCode = url.searchParams.get('oobCode')
    if (!oobCode) return firebaseLink

    const clean = new URL(`${origin.replace(/\/$/, '')}/reset-password`)
    clean.searchParams.set('oobCode', oobCode)
    const email = url.searchParams.get('email')
    if (email) clean.searchParams.set('email', email)
    return clean.toString()
  } catch {
    return firebaseLink
  }
}

export async function createPasswordResetLink(email) {
  const auth = await getFirebaseAdminAuth()
  const origin = getAppOrigin()
  const firebaseLink = await auth.generatePasswordResetLink(email, {
    url: `${origin}/reset-password`,
    handleCodeInApp: true,
  })
  return simplifyPasswordResetLink(firebaseLink, origin)
}
