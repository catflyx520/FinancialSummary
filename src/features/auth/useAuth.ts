import type { User } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getFirebaseServices } from '../../lib/firebase'

export interface AuthState {
  user: User | null
  loading: boolean
  signingIn: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const signInInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    void getFirebaseServices()
      .then(async ({ auth }) => {
        if (disposed) return
        if (!auth) {
          setUser(null)
          setLoading(false)
          return
        }

        const { onAuthStateChanged } = await import('firebase/auth')
        if (disposed) return
        unsubscribe = onAuthStateChanged(
          auth,
          (nextUser) => {
            setUser(nextUser)
            setError(null)
            setLoading(false)
          },
          (authError) => {
            setError(authError.message)
            setLoading(false)
          },
        )
      })
      .catch((initializationError: unknown) => {
        if (disposed) return
        setError(
          initializationError instanceof Error
            ? initializationError.message
            : String(initializationError),
        )
        setLoading(false)
      })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  const signIn = useCallback(async () => {
    if (signInInFlight.current) return
    signInInFlight.current = true
    setSigningIn(true)
    setError(null)
    try {
      const { auth } = await getFirebaseServices()
      if (!auth) throw new Error('Firebase is not configured.')
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : String(signInError))
    } finally {
      signInInFlight.current = false
      setSigningIn(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    try {
      const { auth } = await getFirebaseServices()
      if (!auth) return
      const authModule = await import('firebase/auth')
      await authModule.signOut(auth)
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : String(signOutError))
    }
  }, [])

  return { user, loading, signingIn, error, signIn, signOut }
}
