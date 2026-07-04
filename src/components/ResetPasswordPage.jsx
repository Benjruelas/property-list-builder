import { useEffect, useState } from 'react'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { auth } from '../config/firebase'
import { Button } from './ui/button'
import { Input } from './ui/input'

function parseResetParams() {
  if (typeof window === 'undefined') return { oobCode: null, email: null }
  const params = new URLSearchParams(window.location.search)
  return {
    oobCode: params.get('oobCode') || params.get('code'),
    email: params.get('email'),
  }
}

const RESET_INPUT_CLASS =
  'bg-white text-gray-900 border-white/25 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0'

export function ResetPasswordPage() {
  const [oobCode] = useState(() => parseResetParams().oobCode)
  const [email, setEmail] = useState(() => parseResetParams().email || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verifying, setVerifying] = useState(true)
  const [linkError, setLinkError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!oobCode) {
      setLinkError('This reset link is missing a verification code. Request a new email from the sign-in screen.')
      setVerifying(false)
      return
    }

    let cancelled = false
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (cancelled) return
        setEmail(resolvedEmail)
        setLinkError(null)
      })
      .catch((err) => {
        if (cancelled) return
        const message =
          err?.code === 'auth/expired-action-code'
            ? 'This reset link has expired. Request a new password reset email.'
            : err?.code === 'auth/invalid-action-code'
              ? 'This reset link is invalid or has already been used.'
              : err?.message || 'Unable to verify this reset link.'
        setLinkError(message)
      })
      .finally(() => {
        if (!cancelled) setVerifying(false)
      })

    return () => {
      cancelled = true
    }
  }, [oobCode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!oobCode || linkError) return

    if (password.length < 6) {
      setFormError('Password should be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setDone(true)
      window.history.replaceState({}, '', '/reset-password')
    } catch (err) {
      const message =
        err?.code === 'auth/expired-action-code'
          ? 'This reset link has expired. Request a new password reset email.'
          : err?.code === 'auth/invalid-action-code'
            ? 'This reset link is invalid or has already been used.'
            : err?.code === 'auth/weak-password'
              ? 'Password should be at least 6 characters.'
              : err?.message || 'Failed to reset password.'
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const pageClass =
    'min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0a0a] text-white px-4 py-10'

  if (verifying) {
    return (
      <div className={pageClass} role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-white/70 mb-3" />
        <p className="text-sm text-white/60">Verifying reset link…</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className={pageClass}>
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Password updated</h1>
          <p className="text-sm text-white/70 mb-6">
            Your KnockScout password has been changed. You can sign in with your new password.
          </p>
          <Button asChild className="w-full">
            <a href="/">Open KnockScout</a>
          </Button>
        </div>
      </div>
    )
  }

  if (linkError) {
    return (
      <div className={pageClass}>
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Reset link problem</h1>
          <p className="text-sm text-white/70 mb-6">{linkError}</p>
          <Button asChild variant="outline" className="w-full">
            <a href="/">Back to KnockScout</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Choose a new password</h1>
            <p className="text-sm text-white/60 mt-0.5">KnockScout account{email ? `: ${email}` : ''}</p>
          </div>
        </div>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              disabled={submitting}
              className={RESET_INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
              disabled={submitting}
              className={RESET_INPUT_CLASS}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
