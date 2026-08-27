import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
} from 'firebase/auth'
import { Loader2, CheckCircle2, AlertCircle, Home, Smartphone } from 'lucide-react'
import { auth } from '../config/firebase'
import { completeGoogleHandoff } from '../utils/googleHandoff'
import { LegalFooterLinks } from './legal/LegalFooterLinks'
import { Button } from './ui/button'

const CONTINUE_FLAG = 'knockscout.googleHandoff.continue'

function readHandoffId() {
  if (typeof window === 'undefined') return ''
  try {
    return new URLSearchParams(window.location.search).get('id') || ''
  } catch {
    return ''
  }
}

function markContinueStarted(handoffId) {
  try {
    sessionStorage.setItem(CONTINUE_FLAG, handoffId)
  } catch {
    /* ignore */
  }
}

function didContinueFor(handoffId) {
  try {
    return sessionStorage.getItem(CONTINUE_FLAG) === handoffId
  } catch {
    return false
  }
}

function clearContinueFlag() {
  try {
    sessionStorage.removeItem(CONTINUE_FLAG)
  } catch {
    /* ignore */
  }
}

function GoogleMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function BrandHeader() {
  return (
    <div className="flex flex-col items-center gap-3 mb-6">
      <img
        src="/brand/emblem-white.svg"
        alt=""
        className="h-12 w-12"
        width={48}
        height={48}
      />
      <p className="text-lg font-semibold tracking-tight text-white">KnockScout</p>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0a0a] text-white px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <BrandHeader />
        {children}
      </div>
      <LegalFooterLinks className="mt-8 text-white/50 [&_a]:text-blue-300 [&_a:hover]:text-blue-200" />
    </div>
  )
}

function StepList({ steps }) {
  return (
    <ol className="mt-5 space-y-3 text-left">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-3 text-sm text-white/80">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-semibold text-blue-200">
            {i + 1}
          </span>
          <span className="pt-0.5 leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  )
}

function OpenAppButton({
  label = 'Open KnockScout',
  variant = 'default',
  className = 'w-full mt-6',
}) {
  return (
    <Button asChild variant={variant} className={className}>
      <a href="/" aria-label={label}>
        <Home className="mr-2 h-4 w-4" />
        {label}
      </a>
    </Button>
  )
}

function OpenHomeScreenHint() {
  return (
    <p className="mt-3 text-xs text-white/45 text-center leading-relaxed">
      For the Home Screen app: swipe up (or press Home), then tap the{' '}
      <span className="text-white/70">KnockScout</span> icon. The app finishes sign-in automatically.
    </p>
  )
}

/**
 * Safari bridge for Home Screen Google sign-in — branded KnockScout pages with clear next actions.
 */
export function GoogleHandoffPage() {
  const [handoffId] = useState(() => readHandoffId())
  const [phase, setPhase] = useState(() => {
    if (!handoffId) return 'missing'
    // Returning from Google after Continue — skip intro.
    if (didContinueFor(handoffId)) return 'finishing'
    return 'intro'
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!handoffId) return undefined
    // Only auto-run when returning from Google (or already signed in).
    if (phase !== 'finishing' && phase !== 'redirecting') return undefined

    let cancelled = false

    async function finishWithUser(user) {
      if (!user || cancelled) return
      setPhase('finishing')
      try {
        const idToken = await user.getIdToken()
        await completeGoogleHandoff({ handoffId, idToken })
        clearContinueFlag()
        if (!cancelled) setPhase('done')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to finish Google sign-in.')
          setPhase('error')
        }
      }
    }

    async function runReturn() {
      try {
        const redirectCred = await getRedirectResult(auth)
        if (cancelled) return
        if (redirectCred?.user) {
          await finishWithUser(redirectCred.user)
          return
        }

        if (auth.currentUser) {
          await finishWithUser(auth.currentUser)
          return
        }

        await new Promise((resolve) => {
          const unsub = onAuthStateChanged(auth, (user) => {
            unsub()
            resolve(user)
          })
          window.setTimeout(() => {
            unsub()
            resolve(auth.currentUser)
          }, 2000)
        })

        if (cancelled) return
        if (auth.currentUser) {
          await finishWithUser(auth.currentUser)
          return
        }

        // Landed back without a session — send user to intro to try again.
        clearContinueFlag()
        if (!cancelled) {
          setError('Google sign-in did not complete. Tap Continue with Google to try again.')
          setPhase('intro')
        }
      } catch (err) {
        if (cancelled) return
        clearContinueFlag()
        const code = err?.code || ''
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setError('Google sign-in was cancelled.')
        } else {
          setError(err?.message || 'Google sign-in failed.')
        }
        setPhase('error')
      }
    }

    runReturn()
    return () => {
      cancelled = true
    }
  }, [handoffId, phase])

  const handleContinue = async () => {
    if (!handoffId || busy) return
    setBusy(true)
    setError('')
    setPhase('redirecting')
    markContinueStarted(handoffId)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithRedirect(auth, provider)
    } catch (err) {
      clearContinueFlag()
      setError(err?.message || 'Could not open Google sign-in.')
      setPhase('error')
      setBusy(false)
    }
  }

  if (phase === 'missing') {
    return (
      <Shell>
        <AlertCircle className="mx-auto h-10 w-10 text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-center mb-2">Sign-in link incomplete</h1>
        <p className="text-sm text-white/70 text-center mb-6">
          This Safari page is missing a sign-in session. Start again from the KnockScout app on your Home Screen.
        </p>
        <StepList
          steps={[
            'Open the KnockScout icon on your Home Screen',
            'Tap Sign in with Google',
            'Safari will open this page again with a valid link',
          ]}
        />
        <OpenAppButton label="Open KnockScout" />
        <OpenHomeScreenHint />
      </Shell>
    )
  }

  if (phase === 'intro') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-center mb-2">Sign in with Google</h1>
        <p className="text-sm text-white/70 text-center">
          You&apos;re signing into the <span className="text-white font-medium">KnockScout Home Screen app</span>.
          Safari is required for Google — then you&apos;ll return to the app.
        </p>
        <StepList
          steps={[
            'Tap Continue with Google below',
            'Choose your Google account',
            'Come back to this page — we finish the connection',
            'Open KnockScout from your Home Screen',
          ]}
        />
        {error ? (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {error}
          </div>
        ) : null}
        <Button
          type="button"
          className="w-full mt-6"
          onClick={handleContinue}
          disabled={busy}
        >
          <GoogleMark className="mr-2 h-5 w-5" />
          Continue with Google
        </Button>
        <OpenAppButton
          label="Cancel and open KnockScout"
          variant="outline"
          className="w-full mt-3 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
        />
        <p className="mt-4 text-xs text-white/45 text-center leading-relaxed">
          After Google, stay in Safari until you see the success screen. Then switch back to the Home Screen app.
        </p>
      </Shell>
    )
  }

  if (phase === 'redirecting') {
    return (
      <Shell>
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300 mb-4" />
        <h1 className="text-xl font-semibold text-center mb-2">Opening Google</h1>
        <p className="text-sm text-white/70 text-center">
          Taking you to Google to choose an account. This is still KnockScout sign-in — you&apos;ll return here next.
        </p>
        <p className="mt-5 text-xs text-white/45 text-center">
          If nothing happens, use Back and tap Continue with Google again.
        </p>
      </Shell>
    )
  }

  if (phase === 'finishing') {
    return (
      <Shell>
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300 mb-4" />
        <h1 className="text-xl font-semibold text-center mb-2">Finishing sign-in</h1>
        <p className="text-sm text-white/70 text-center">
          Connecting your Google account to KnockScout. Keep this Safari tab open for a moment.
        </p>
      </Shell>
    )
  }

  if (phase === 'done') {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400 mb-4" />
        <h1 className="text-xl font-semibold text-center mb-2">You&apos;re signed in</h1>
        <p className="text-sm text-white/70 text-center">
          Google sign-in succeeded. Return to KnockScout to continue.
        </p>
        <div className="mt-6 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4 text-left space-y-3">
          <div className="flex gap-3 text-sm text-emerald-50">
            <Home className="h-5 w-5 shrink-0 text-emerald-300 mt-0.5" />
            <span>
              <span className="font-medium text-white">Best: Home Screen icon</span>
              <span className="block text-white/70 mt-1">
                Swipe up from the bottom (or press Home), then tap the KnockScout icon.
              </span>
            </span>
          </div>
          <div className="flex gap-3 text-sm text-emerald-50">
            <Smartphone className="h-5 w-5 shrink-0 text-emerald-300 mt-0.5" />
            <span>
              <span className="font-medium text-white">No extra tap needed in the app</span>
              <span className="block text-white/70 mt-1">
                KnockScout will finish signing you in automatically when you return.
              </span>
            </span>
          </div>
        </div>
        <OpenAppButton label="Open KnockScout" />
        <OpenHomeScreenHint />
      </Shell>
    )
  }

  // error
  return (
    <Shell>
      <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-4" />
      <h1 className="text-xl font-semibold text-center mb-2">Google sign-in didn&apos;t finish</h1>
      <p className="text-sm text-red-200/90 text-center mb-2">{error || 'Something went wrong.'}</p>
      <p className="text-sm text-white/70 text-center mb-6">
        You can try again here, or go back to KnockScout and start over.
      </p>
      <Button type="button" className="w-full" onClick={handleContinue} disabled={busy}>
        <GoogleMark className="mr-2 h-5 w-5" />
        Try Google again
      </Button>
      <OpenAppButton
        label="Open KnockScout"
        variant="outline"
        className="w-full mt-3 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
      />
      <OpenHomeScreenHint />
    </Shell>
  )
}
