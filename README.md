# Financial Summary

A personal finance app with a local ledger, fictional demo data, and an optional Firebase cloud ledger.

**Stack:** React · TypeScript · Vite · Firebase

![Financial Summary dashboard overview](docs/images/dashboard-screenshot.png)

## Features

- Monthly income and expenses, spending categories, and an overview of assets and liabilities.
- Transaction management, CSV export, and recurring income and expense schedules.
- Import and review text-based Chase credit card PDF statements.
- Chinese and English interfaces for desktop and mobile, with optional Google sign-in and cloud storage.

## Quick start

Use Node.js 24. **The local ledger and demo mode require no API keys.**

```sh
git clone https://github.com/catflyx520/FinancialSummary.git
cd FinancialSummary
npm ci
npm run dev
```

Open the URL shown in your terminal. Demo data stays separate from your real ledger. The local ledger is stored only in the current browser and does not automatically sync to the cloud.

Use the **Chinese / English** selector at the top to change the interface language. Your choice is remembered, and switching languages preserves your ledger and any form you are filling out.

## Cloud setup (optional)

Copy `.env.example` to `.env.local` in the project root and enter your own Firebase Web configuration:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

PowerShell: `Copy-Item .env.example .env.local` · macOS/Linux: `cp .env.example .env.local`.

You also need to enable Google sign-in, set `ownerUid`, and deploy the Firestore rules. Follow the **[Firebase setup guide](FIREBASE_SETUP.md)**. Restart the development server after changing the configuration; production builds must be rebuilt.

`.env.local` is ignored by Git. Firebase Web configuration is included in the frontend build, so never put service account private keys or secrets for other services in it.

## Usage and development

- [Usage and limitations](USAGE.md): transaction and balance rules, supported PDFs, and common questions.
- [Architecture](ARCHITECTURE.md): data structures and access rules.

```sh
npm test -- --run
npm run build
npm run lint
npm run test:rules # Firestore emulator; requires Java 21+
```
