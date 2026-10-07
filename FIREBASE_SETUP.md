# Firebase Setup

This project works in local/demo mode without Firebase. To enable a private cloud workspace, configure your own Firebase project.

## 1. Create a Web app

In Firebase Console, create or select a project and register a Web application. Copy the public Web configuration into a local `.env.local` file:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=

# Optional
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

The repository intentionally does not contain a real Firebase configuration, service-account JSON, Admin SDK private key, Authentication UID, personal email address, or financial data.

## 2. Enable Google sign-in

In Firebase Console:

1. Open Authentication → Sign-in method.
2. Enable Google.
3. Add the development and production domains you intend to use.

## 3. Configure Firestore ownership

After signing in to your own application once, obtain your Firebase Authentication UID and create the following document manually in Firestore:

```text
collection: config
document: access
field: ownerUid
type: string
value: YOUR_AUTHENTICATION_UID
```

Do not commit the UID, email address, or production Firebase identifiers to this repository.

## 4. Deploy Firestore rules

The repository includes `firestore.rules`. Review the rules, then deploy them to your Firebase project:

```sh
npx firebase login
npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

The rules are designed for a single-owner workspace. Client access is limited to authenticated records under the configured owner's UID, while the `config` collection is not readable or writable by the client.

Data paths:

```text
users/{uid}/transactions/{id}
users/{uid}/accounts/{id}
users/{uid}/recurring_payments/{id}
```

## 5. Validate safely

Use synthetic data when testing a public clone of this repository. Do not commit:

- bank or credit-card statements
- transaction exports
- account numbers
- personal email addresses or Authentication UIDs
- service-account files or private keys
- production `.env` files

The PDF import flow processes supported statements locally in the browser; the original PDF is not uploaded by the application.
