import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
]

export const isFirebaseConfigured = requiredConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
)

export interface FirebaseServices {
  app: FirebaseApp | null
  auth: Auth | null
  db: Firestore | null
}

const unconfiguredServices: FirebaseServices = {
  app: null,
  auth: null,
  db: null,
}

let servicesPromise: Promise<FirebaseServices> | null = null

export function getFirebaseServices(): Promise<FirebaseServices> {
  if (!isFirebaseConfigured) {
    return Promise.resolve(unconfiguredServices)
  }

  servicesPromise ??= Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]).then(([appModule, authModule, firestoreModule]) => {
    const app =
      appModule.getApps().length > 0
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig)

    return {
      app,
      auth: authModule.getAuth(app),
      db: firestoreModule.getFirestore(app),
    }
  })

  return servicesPromise
}
