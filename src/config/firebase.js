import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

/** Canonical auth domain — must match Google OAuth redirect URI host (not www + apex mix). */
function resolveAuthDomain() {
  const fromEnv = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.host
    // Never use *.firebaseapp.com in the browser — auth iframes/redirects stay on our domain.
    if (!fromEnv || /\.firebaseapp\.com$/i.test(fromEnv)) return host
    return fromEnv
  }
  if (fromEnv && !/\.firebaseapp\.com$/i.test(fromEnv)) return fromEnv
  return 'localhost'
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Persist auth across page refreshes
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Failed to set auth persistence:', error)
})
