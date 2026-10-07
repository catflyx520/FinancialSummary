# Financial Summary Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a minimal, buildable Vite + React + TypeScript project that documents and preserves the agreed Firebase architecture without implementing product features.

**Architecture:** The browser entry point renders a small application shell. Firebase setup is isolated and lazy-loaded in `src/lib/firebase.ts`, which returns a clear unconfigured state until all public web configuration variables are present; finance model interfaces live in `src/types/finance.ts`. The architecture document remains the source of truth for future Auth, Firestore, Storage, recurring payment, and PDF import work.

**Tech Stack:** Vite, React, TypeScript, Firebase Web SDK, Vitest, Testing Library

**Spec:** `ARCHITECTURE.md`

## Global Constraints

- Keep this phase to scaffolding and documentation.
- Do not implement real authentication, PDF parsing, automatic classification, transaction persistence, or a financial dashboard.
- Store user data under `users/{uid}` and uploaded PDFs under `users/{uid}/statements` in future implementations.
- Never place Firebase Admin SDK credentials or other private server keys in the browser project.
- Use integer minor currency units in future financial persistence code.

---

### Task 1: Buildable React and Firebase scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/test/setup.ts`
- Create: `src/styles.css`
- Create: `src/lib/firebase.ts`
- Create: `src/types/finance.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: Vite `import.meta.env` values named in `.env.example`.
- Produces: `getFirebaseServices()` returning nullable `app`, `auth`, `db`, and `storage` properties; exported finance interfaces; a renderable `App` component.

- [x] **Step 1: Create the test harness and write the application-shell test**

Create `package.json` with `dev`, `build`, `lint`, `preview`, and `test` scripts. Add the Vite, TypeScript, Vitest, jsdom, ESLint, React Testing Library, and Firebase dependencies. Configure Vitest to use jsdom and `src/test/setup.ts`. Then add this test before creating `App.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('identifies the project as a scaffold awaiting Firebase setup', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /financial summary/i })).toBeInTheDocument()
    expect(screen.getByText(/firebase configuration/i)).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Install dependencies and run the test to verify it fails**

Run: `npm install && npm test -- --run`

Expected: FAIL because `src/app/App.tsx` does not exist yet. This demonstrates that adding the application shell is the production change that makes the test pass.

- [x] **Step 3: Add the minimal project configuration and application shell**

Create the Vite and TypeScript configuration files, the React entry point, the small `App` component, and accessible styling. The page must show the project name, describe the scaffold state, and list Auth, Firestore, Storage, and recurring payments as future capabilities without presenting them as implemented.

- [x] **Step 4: Add the Firebase boundary and finance model types**

`src/lib/firebase.ts` must read all six `VITE_FIREBASE_*` values, load and initialize Firebase only when every value is non-empty, and return nullable services otherwise. `src/types/finance.ts` must define `Transaction`, `MonthlySummary`, `Account`, `NetWorthSnapshot`, `MerchantRule`, and `RecurringPayment` interfaces matching `ARCHITECTURE.md`.

- [x] **Step 5: Add setup documentation and environment template**

`README.md` must contain prerequisites, install/run/build/test commands, Firebase Console setup steps, and a link to `ARCHITECTURE.md`. `.env.example` must contain the six public Firebase Web App variable names with empty values. `.gitignore` must exclude dependencies, build output, and local environment files while retaining `.env.example`.

- [x] **Step 6: Run all verification commands**

Run: `npm test -- --run`

Expected: PASS with one application-shell test.

Run: `npm run build`

Expected: PASS and create `dist/`.

Run: `npm run lint`

Expected: PASS with no lint errors.

- [x] **Step 7: Review the generated project**

Confirm that no real credentials are present, no product behavior beyond the scaffold was implemented, `ARCHITECTURE.md` includes `recurring_payments`, and the generated file tree matches the documented starting structure where relevant.
