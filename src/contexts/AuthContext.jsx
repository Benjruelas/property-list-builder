import { createContext, useContext, useEffect, useState } from 'react'
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
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

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Sign up with email and password
  const signup = async (email, password, displayName) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      
      // Update display name if provided
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, { displayName })
      }
      
      console.log('✅ Signup successful, user:', userCredential.user?.email, 'uid:', userCredential.user?.uid)
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
      console.log('✅ Login successful, user:', userCredential.user?.email, 'uid:', userCredential.user?.uid)
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

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      console.log('✅ Google login successful, user:', userCredential.user?.email, 'uid:', userCredential.user?.uid)
      // onAuthStateChanged will automatically update currentUser
      // Don't set it manually here to avoid race conditions - let onAuthStateChanged handle it
      showToast('Signed in with Google successfully!', 'success')
      return userCredential
    } catch (error) {
      let errorMessage = 'Failed to sign in with Google'
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed'
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Sign-in was cancelled'
      }
      showToast(errorMessage, 'error')
      throw error
    }
  }

  // Sign out
  const logout = async () => {
    try {
      console.log('🚪 Calling Firebase signOut...')
      await signOut(auth)
      // onAuthStateChanged will automatically set currentUser to null
      // But we can also explicitly clear it here for immediate feedback
      setCurrentUser(null)
      console.log('✅ SignOut successful, currentUser cleared')
      showToast('Signed out successfully', 'success')
    } catch (error) {
      console.error('❌ SignOut error:', error)
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

  // Listen for auth state changes
  useEffect(() => {
    console.log('🔧 Setting up auth state listener...')
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔄 Auth state changed, user:', user?.email || 'null', 'uid:', user?.uid || 'null', 'loading:', loading)
      setCurrentUser(user)
      setLoading(false)
      console.log('✅ Auth state updated, loading set to false')
    }, (error) => {
      console.error('❌ Auth state change error:', error)
      setCurrentUser(null)
      setLoading(false)
    })

    return () => {
      console.log('🧹 Cleaning up auth state listener')
      unsubscribe()
    }
  }, [])

  const value = {
    currentUser,
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
