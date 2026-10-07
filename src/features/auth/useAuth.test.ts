import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getFirebaseServices: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../lib/firebase', () => ({
  getFirebaseServices: mocks.getFirebaseServices,
}))

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
}))

import { useAuth } from './useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getFirebaseServices.mockResolvedValue({ app: {}, auth: {}, db: {} })
    mocks.onAuthStateChanged.mockImplementation(
      (_auth, onUser: (user: null) => void) => {
        onUser(null)
        return () => undefined
      },
    )
  })

  it('settles as signed out when Firebase is unconfigured', async () => {
    mocks.getFirebaseServices.mockResolvedValue({ app: null, auth: null, db: null })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.error).toBeNull()
    expect(mocks.onAuthStateChanged).not.toHaveBeenCalled()
  })

  it('exposes a rejected Google popup as a handled error', async () => {
    mocks.signInWithPopup.mockRejectedValue(new Error('Popup blocked'))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signIn()
    })

    expect(result.current.error).toBe('Popup blocked')
  })

  it('starts only one popup for calls made before the pending state renders', async () => {
    let finishPopup!: () => void
    mocks.signInWithPopup.mockReturnValue(
      new Promise<void>((resolve) => { finishPopup = resolve }),
    )
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let finishInitialization!: (services: unknown) => void
    mocks.getFirebaseServices.mockClear().mockReturnValue(
      new Promise((resolve) => { finishInitialization = resolve }),
    )
    const signIn = result.current.signIn
    let firstAttempt!: Promise<void>
    let duplicateAttempt!: Promise<void>

    act(() => {
      firstAttempt = signIn()
      duplicateAttempt = signIn()
    })
    expect(mocks.getFirebaseServices).toHaveBeenCalledTimes(1)

    await act(async () => { finishInitialization({ app: {}, auth: {}, db: {} }) })
    await waitFor(() => expect(mocks.signInWithPopup).toHaveBeenCalled())
    expect(result.current.signingIn).toBe(true)
    expect(result.current.error).toBeNull()

    await act(async () => {
      finishPopup()
      await Promise.all([firstAttempt, duplicateAttempt])
    })
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1)
    expect(result.current.signingIn).toBe(false)

    mocks.signInWithPopup.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.signIn() })
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(2)
  })

  it('clears the pending state after a rejected popup and allows retry', async () => {
    let rejectPopup!: (reason: Error) => void
    mocks.signInWithPopup.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => { rejectPopup = reject }),
    )
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let attempt!: Promise<void>
    act(() => { attempt = result.current.signIn() })
    await waitFor(() => expect(mocks.signInWithPopup).toHaveBeenCalled())
    expect(result.current.signingIn).toBe(true)

    await act(async () => {
      rejectPopup(new Error('Popup closed'))
      await attempt
    })
    expect(result.current.signingIn).toBe(false)
    expect(result.current.error).toBe('Popup closed')

    mocks.signInWithPopup.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.signIn() })
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(2)
    expect(result.current.signingIn).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('releases the login guard when initialization fails before opening a popup', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    mocks.getFirebaseServices.mockRejectedValueOnce(new Error('Initialization failed'))

    await act(async () => { await result.current.signIn() })
    expect(result.current.signingIn).toBe(false)
    expect(result.current.error).toBe('Initialization failed')
    expect(mocks.signInWithPopup).not.toHaveBeenCalled()

    mocks.signInWithPopup.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.signIn() })
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })
})
