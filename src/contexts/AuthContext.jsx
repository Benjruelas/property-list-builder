import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth'
import { auth } from '../config/firebase'
import { showToast } from '../components/ui/toast'

function AuthLoadingShell() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 bg-[#0a0a0a] text-white/80"
      role="status"
      aria-live="polite"
      aria-label="Loading authentication"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      <p className="text-sm text-white/60">Signing in…</p>
    </div>
  )
}

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const DEV_USER = { uid: 'dev-local', email: 'dev@localhost', displayName: 'Dev User' }
const isDev = import.meta.env.DEV

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(isDev ? DEV_USER : null)
  const [loading, setLoading] = useState(!isDev)

  // Sign up with email and password
  const signup = async (email, password, displayName) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      
      // Update display name if provided
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, { displayName })
      }
      
      // onAuthStateChanged will automatically update currentUser
      // Don't set it manually here to avoid race conditions - let onAuthStateChanged handle it
      showToast('Account created successfully!', 'success')
      return userCredential
    } catch (error) {
      let errorMessage = 'Failed to create account'
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'This email is already registered'
          break
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address'
          break
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters'
          break
        default:
          errorMessage = error.message
      }
      showToast(errorMessage, 'error')
      throw error
    }
  }

  // Sign in with email and password
  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      // onAuthStateChanged will automatically update currentUser
      // Don't set it manually here to avoid race conditions - let onAuthStateChanged handle it
      showToast('Signed in successfully!', 'success')
      return userCredential
    } catch (error) {
      let errorMessage = 'Failed to sign in'
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email'
          break
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password'
          break
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address'
          break
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled'
          break
        default:
          errorMessage = error.message
      }
      showToast(errorMessage, 'error')
      throw error
    }
  }

  // Full-page redirect to Google (better on mobile than popup).
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithRedirect(auth, provider)
      showToast('Redirecting to Google…', 'info')
    } catch (error) {
      showToast(error.message || 'Failed to sign in with Google', 'error')
      throw error
    }
  }

  // Dev bypass: skip Firebase auth entirely
  useEffect(() => {
    if (isDev) {
      setCurrentUser(DEV_USER)
      setLoading(false)
      return
    }
  }, [])

  // Handle redirect result when returning from Google OAuth
  useEffect(() => {
    if (isDev) return
    getRedirectResult(auth)
      .then((userCredential) => {
        if (userCredential?.user) {
          showToast('Signed in with Google successfully!', 'success')
        }
      })
      .catch((error) => {
        const code = error?.code || ''
        if (code && code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          console.error('Google redirect sign-in failed:', error)
          showToast(error.message || 'Sign-in failed', 'error')
        }
      })
  }, [])

  // Never leave a blank screen if auth init stalls (e.g. blocked auth iframe).
  useEffect(() => {
    if (isDev) return
    const timeout = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth initialization timed out; rendering app anyway.')
        }
        return false
      })
    }, 12000)
    return () => window.clearTimeout(timeout)
  }, [])

  // Sign out
  const logout = async () => {
    try {
      await signOut(auth)
      // onAuthStateChanged will automatically set currentUser to null
      // But we can also explicitly clear it here for immediate feedback
      setCurrentUser(null)
      showToast('Signed out successfully', 'success')
    } catch (error) {
      console.error('SignOut error:', error)
      showToast('Failed to sign out', 'error')
      throw error
    }
  }

  // Reset password
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email)
      showToast('Password reset email sent! Check your inbox.', 'success')
    } catch (error) {
      let errorMessage = 'Failed to send password reset email'
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email'
          break
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address'
          break
        default:
          errorMessage = error.message
      }
      showToast(errorMessage, 'error')
      throw error
    }
  }

  // Listen for auth state changes (skip in dev)
  useEffect(() => {
    if (isDev) return
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setLoading(false)
    }, (error) => {
      console.error('Auth state change error:', error)
      setCurrentUser(null)
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Stable identity: reads auth.currentUser live at call time, so it never needs
  // to be recreated. A new identity on every render would churn any effect that
  // depends on getToken (e.g. photo thumbnail loaders), cancelling in-flight
  // fetches and leaving spinners stuck even when the request succeeds.
  const getToken = useCallback(
    () => (isDev ? Promise.resolve('dev-bypass') : (auth.currentUser?.getIdToken?.() ?? Promise.resolve(null))),
    [],
  )

  const updateDisplayName = async (displayName) => {
    const trimmed = (displayName || '').trim()
    if (isDev) {
      setCurrentUser((prev) => (prev ? { ...prev, displayName: trimmed } : prev))
      return
    }
    if (!auth.currentUser) throw new Error('Sign in required')
    await updateProfile(auth.currentUser, { displayName: trimmed || null })
    setCurrentUser({ ...auth.currentUser, displayName: trimmed })
  }

  // Memoized so consumers of the context don't re-render on every provider
  // render — only when auth state actually changes.
  const value = useMemo(() => ({
    currentUser,
    getToken,
    signup,
    login,
    signInWithGoogle,
    logout,
    resetPassword,
    updateDisplayName,
    loading
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentUser, loading, getToken])

  return (
    <AuthContext.Provider value={value}>
      {loading ? <AuthLoadingShell /> : children}
    </AuthContext.Provider>
  )
}
