import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
it('does not initialize Firebase in a public demo even when Web configuration is supplied', async () => {
  vi.stubEnv('VITE_PUBLIC_DEMO', 'true')
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID']) vi.stubEnv(`VITE_FIREBASE_${key}`, 'test-not-a-real-credential')
  const firebase = await import('./firebase')
  expect(firebase.isFirebaseConfigured).toBe(false)
  expect(await firebase.getFirebaseServices()).toEqual({ app: null, auth: null, db: null })
})
