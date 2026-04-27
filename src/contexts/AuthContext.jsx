import { createContext, useContext, useEffect, useState } from 'react'
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

  // Sign in with Google (use redirect to avoid COOP blocking window.close in popup)
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      // Force the Google account chooser instead of silently reusing the last session
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithRedirect(auth, provider)
      showToast('Redirecting to Google...', 'info')
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
          showToast(error.message || 'Sign-in failed', 'error')
        }
      })
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

  const getToken = () =>
    isDev ? Promise.resolve('dev-bypass') : (auth.currentUser?.getIdToken?.() ?? Promise.resolve(null))

  const value = {
    currentUser,
    getToken,
    signup,
    login,
    signInWithGoogle,
    logout,
    resetPassword,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
