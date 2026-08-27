import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
} from 'firebase/auth'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { auth } from '../config/firebase'
import { completeGoogleHandoff } from '../utils/googleHandoff'
import { LegalFooterLinks } from './legal/LegalFooterLinks'

function readHandoffId() {
  if (typeof window === 'undefined') return ''
  try {
    return new URLSearchParams(window.location.search).get('id') || ''
  } catch {
    return ''
  }
}

/**
 * Safari-only bridge: finish Google OAuth here, mint handoff token for the Home Screen app.
 */
export function GoogleHandoffPage() {
  const [handoffId] = useState(() => readHandoffId())
  const [phase, setPhase] = useState(() => (handoffId ? 'working' : 'missing'))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!handoffId) return undefined

    let cancelled = false

    async function finishWithUser(user) {
      if (!user || cancelled) return
      setPhase('working')
      try {
        const idToken = await user.getIdToken()
        await completeGoogleHandoff({ handoffId, idToken })
        if (!cancelled) setPhase('done')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to finish Google sign-in.')
          setPhase('error')
        }
      }
    }

    async function run() {
      try {
        const redirectCred = await getRedirectResult(auth)
        if (cancelled) return
        if (redirectCred?.user) {
          await finishWithUser(redirectCred.user)
          return
        }

        const existing = auth.currentUser
        if (existing) {
          await finishWithUser(existing)
          return
        }

        // Wait briefly for auth restore, then start Google redirect in Safari.
        await new Promise((resolve) => {
          const unsub = onAuthStateChanged(auth, (user) => {
            unsub()
            resolve(user)
          })
          window.setTimeout(() => {
            unsub()
            resolve(auth.currentUser)
          }, 1500)
        })

        if (cancelled) return
        if (auth.currentUser) {
          await finishWithUser(auth.currentUser)
          return
        }

        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ prompt: 'select_account' })
        await signInWithRedirect(auth, provider)
      } catch (err) {
        if (cancelled) return
        const code = err?.code || ''
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setError('Google sign-in was cancelled.')
        } else {
          setError(err?.message || 'Google sign-in failed.')
        }
        setPhase('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [handoffId])

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6 py-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="w-full max-w-md space-y-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">KnockScout</h1>

        {phase === 'missing' && (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-amber-400" />
            <p className="text-sm text-white/80">
              This Google sign-in link is incomplete. Open KnockScout from your Home Screen and tap Sign in with Google again.
            </p>
          </>
        )}

        {phase === 'working' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300" />
            <p className="text-sm text-white/80">Finishing Google sign-in…</p>
          </>
        )}

        {phase === 'done' && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="text-base font-medium">You&apos;re signed in</p>
            <p className="text-sm text-white/80">
              Return to the KnockScout Home Screen app — it will finish signing you in automatically.
            </p>
            <p className="text-xs text-white/50">
              On iPhone: swipe up or tap the Home Screen icon to go back.
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
            <p className="text-sm text-red-200">{error || 'Google sign-in failed.'}</p>
            <p className="text-sm text-white/70">
              Close this tab and try Sign in with Google again from the Home Screen app.
            </p>
          </>
        )}

        <LegalFooterLinks className="pt-4 text-white/50" />
      </div>
    </div>
  )
}
