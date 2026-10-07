# Finance Workspace Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent domains and review the integrated result.

**Goal:** A usable personal finance workspace, local now and ready for private Firebase.
**Architecture:** Integer-cent records shared by domain calculations, repositories and React UI. Local, in-memory demo and authenticated cloud are separate.
**Tech Stack:** Existing React 19, TypeScript, Vite, Firebase 12, Vitest, Testing Library.
**Spec:** `docs/superpowers/specs/2026-09-16-finance-workspace.md`

## Global Constraints
- USD integer cents; manual account balance snapshots.
- Chinese UI, local dates, refunds subtract expenses, transfers excluded.
- Non-Git project directory; no commits, publishing, invented Firebase config or private keys.

## Task 1: Domain
Files: src/lib/finance.ts, finance.test.ts, demo.ts; shared src/types/finance.ts.
- [x] Failing tests for integer money parsing, month boundaries, refund/transfer handling, liabilities, monthly equivalents, CSV escaping, invalid persisted data.
- [x] Exports: parseMoney(string):number (throws invalid); formatMoney(number):string; localDate():string; summarizeMonth(Transaction[],month) => {incomeCents,expenseCents,netCents,transactionCount,categories:{category,amountCents}[]}; summarizeAccounts(Account[]) => {assetsCents,liabilitiesCents,netWorthCents}; monthlyRecurringCents(RecurringPayment[]):number; transactionsCsv(Transaction[]):string; validateFinanceData(unknown):FinanceData (throws invalid).
- [x] Constants: categories:{id,label,color}[], accountTypes:Record<AccountType,string>, frequencies:Record<RecurringFrequency,string>, transactionTypes:Record<TransactionType,string>. demo.ts exports getDemoData():FinanceData. Test to green.

## Task 2: Persistence/auth
Files: src/lib/repository.ts and tests, src/lib/firebase.ts, src/features/auth/useAuth.ts, firestore.rules, firebase.json, .env.example, src/vite-env.d.ts, FIREBASE_SETUP.md.
- [x] Failing tests for local roundtrip, corrupted storage preservation, write failure preserving state, memory demo isolation.
- [x] FinanceRepository: subscribe(onData:(data:FinanceData)=>void,onError:(error:Error)=>void):()=>void; saveTransaction(Transaction):Promise<void>; deleteTransaction(id:string):Promise<void>; saveAccount(Account),deleteAccount(id); saveRecurringPayment(RecurringPayment),deleteRecurringPayment(id).
- [x] Factories createLocalRepository():FinanceRepository; createMemoryRepository(FinanceData):FinanceRepository; createFirestoreRepository(uid:string):Promise<FinanceRepository>.
- [x] useAuth() => {user:User|null,loading:boolean,error:string|null,signIn:()=>Promise<void>,signOut:()=>Promise<void>}. Unconfigured state is signed out. Handle rejected auth promises.
- [x] Owner-only rules using protected config/access.ownerUid plus path UID, record validation. Instructions for config, provider, authorized localhost, owner doc, rules deployment. No deploy.

## Task 3: Workspace UI
Files: src/app/App.tsx and App.test.tsx; src/features/workspace/*; src/components/*; src/styles.css.
- [x] Test local zero state, income updates month, persistence across remount, transfer excluded, edit/delete, demo isolation.
- [x] Mode lifecycle: unconfigured local, configured signed-out login, explicit demo repository. Cleanup stale async subscriptions.
- [x] Month dashboard, six-month trend, categories, filtered transaction list/CSV, accounts and recurring CRUD forms, delete confirmation.
- [x] Google login/settings instructions, clear local/demo state, responsive accessible UI.

## Task 4: Integration
- [x] npm test -- --run; npm run build; npm run lint.
- [x] Browser desktop/mobile smoke: disposable local transaction create/edit/delete, persistence/month filtering.
- [x] Independent review: local multi-tab loss, money overflow and rule mismatches fixed; scoped re-review passed.
- [x] Update README and ARCHITECTURE with implemented scope and required external setup. Open preview.

## Progress
Ruling: Continue the previously approved architecture under user's explicit “接着做”; no duplicate design approval. Existing project is not a Git repository. Auth/config missing does not block local functionality. PDF parser waits for a representative statement to avoid false accounting.

Task 1: implemented and reviewed; financial edge-case follow-up in progress.
Task 2: implemented; emulator tests and multi-tab protection follow-up in progress.
Task 3: complete — browser verified local create/edit/delete and refresh persistence; desktop and 390px mobile layouts checked. Synthetic browser test record removed.
Task 4: first integrated run 53 unit tests passed; build and lint passed. Waiting for review fixes before final checks.

Final verification: 78/78 Vitest tests, 23/23 Firestore emulator tests, production build and ESLint all passed. Browser checks covered local create/edit/delete, refresh persistence, demo isolation, desktop and 390px mobile layouts. No browser console errors.
Task 1: complete. Task 2: complete. Task 3: complete. Task 4: complete.
Limitations: real Firebase connection/deployment requires user Web config and owner UID; PDF import requires representative statement and remains next stage. No Git repository was present, so no commit/merge performed. Firebase Firestore lazy SDK chunk remains above the build size warning threshold; initial app bundle is 247KB raw / 77KB gzip.
