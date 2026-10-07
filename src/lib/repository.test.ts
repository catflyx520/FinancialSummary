import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Account, FinanceData, RecurringPayment, Transaction } from '../types/finance'
import {
  createFirestoreRepository,
  createLocalRepository,
  createMemoryRepository,
} from './repository'

const firestoreMocks = vi.hoisted(() => ({
  getFirebaseServices: vi.fn(),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  runTransaction: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((collectionReference: unknown) => collectionReference),
  where: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('./firebase', () => ({
  getFirebaseServices: firestoreMocks.getFirebaseServices,
}))

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  onSnapshot: firestoreMocks.onSnapshot,
  setDoc: firestoreMocks.setDoc,
  runTransaction: firestoreMocks.runTransaction,
  deleteDoc: firestoreMocks.deleteDoc,
  getDocs: firestoreMocks.getDocs,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  limit: firestoreMocks.limit,
}))

const STORAGE_KEY = 'financial-summary:v1:data'

const transaction: Transaction = {
  id: 'transaction-1',
  date: '2026-09-16',
  merchant: 'Salary',
  amountCents: 250_000,
  type: 'income',
  category: 'income',
  accountId: 'account-1',
  note: '',
  source: 'manual',
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

const account: Account = {
  id: 'account-1',
  name: 'Checking',
  type: 'checking',
  balanceCents: 250_000,
  currency: 'USD',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

const recurringPayment: RecurringPayment = {
  id: 'recurring-1',
  name: 'Rent',
  category: 'housing',
  amountCents: 120_000,
  frequency: 'monthly',
  nextDueDate: '2026-10-01',
  accountId: 'account-1',
  autoPay: true,
  active: true,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

function subscribeOnce(repository: ReturnType<typeof createLocalRepository>) {
  return new Promise<FinanceData>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined
    unsubscribe = repository.subscribe(
      (data) => {
        unsubscribe()
        resolve(data)
      },
      reject,
    )
  })
}

describe('createLocalRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('deducts due expenses and preserves the balance across repeat execution, edits and deletion', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount(account)
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true,
      endDate: '2026-11-01' })
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(2)
    let data = await subscribeOnce(createLocalRepository())
    expect(data.accounts[0]?.balanceCents).toBe(10000)
    expect(data.transactions.map(t => ({ type: t.type, date: t.date, amount: t.amountCents }))).toEqual([
      { type: 'expense', date: '2026-10-01', amount: 120000 },
      { type: 'expense', date: '2026-11-01', amount: 120000 },
    ])
    await repository.saveTransaction({ ...data.transactions[0]!, amountCents: 119000 })
    await repository.deleteTransaction(data.transactions[1]!.id)
    await expect(repository.postDueRecurring('2026-12-01')).resolves.toBe(0)
    data = await subscribeOnce(createLocalRepository())
    expect(data.accounts[0]?.balanceCents).toBe(10000)
    expect(data.transactions).toHaveLength(1)
  })

  it('leaves records, account and posting progress unchanged when funds are insufficient', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount({ ...account, balanceCents: 119999 })
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true })
    const before = await subscribeOnce(createLocalRepository())
    await expect(repository.postDueRecurring('2026-10-01')).rejects.toThrow('余额不足')
    expect(await subscribeOnce(createLocalRepository())).toEqual(before)
    await repository.saveAccount(account)
    await repository.postDueRecurring('2026-10-01')
    expect((await subscribeOnce(createLocalRepository())).accounts[0]?.balanceCents).toBe(130000)
  })

  it('adds credit card debt and does not change salary account balances', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount({ ...account, type: 'credit' })
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true })
    await repository.postDueRecurring('2026-10-01')
    expect((await subscribeOnce(createLocalRepository())).accounts[0]?.balanceCents).toBe(370000)
    await repository.saveRecurringPayment({ ...recurringPayment, id: 'salary', type: 'income', autoPost: true })
    await repository.postDueRecurring('2026-10-01')
    const data = await subscribeOnce(createLocalRepository())
    expect(data.accounts[0]?.balanceCents).toBe(370000)
    expect(data.transactions.map(t => t.type)).toEqual(['expense', 'income'])
  })

  it('keeps legacy automatic payment markers inactive until automatic posting is enabled', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount(account)
    await repository.saveRecurringPayment(recurringPayment)
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(0)
    const data = await subscribeOnce(createLocalRepository())
    expect(data.transactions).toEqual([])
    expect(data.accounts[0]?.balanceCents).toBe(250000)
  })

  it('reports missing or loan debit accounts without recording an expense', async () => {
    const repository = createLocalRepository()
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true })
    await expect(repository.postDueRecurring('2026-10-01')).rejects.toThrow('账户')
    await repository.saveAccount({ ...account, type: 'loan' })
    await expect(repository.postDueRecurring('2026-10-01')).rejects.toThrow('贷款')
    expect((await subscribeOnce(createLocalRepository())).transactions).toEqual([])
  })

  it('does not let a failed expense block another due plan', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount({ ...account, balanceCents: 0 })
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true })
    await repository.saveRecurringPayment({ ...recurringPayment, id: 'salary', type: 'income', autoPost: true })
    await expect(repository.postDueRecurring('2026-10-01')).rejects.toThrow('余额不足')
    const data = await subscribeOnce(createLocalRepository())
    expect(data.transactions.map(t => t.type)).toEqual(['income'])
    expect(data.recurringPayments[0]?.lastPostedDate).toBeUndefined()
    expect(data.recurringPayments[1]?.lastPostedDate).toBe('2026-10-01')
  })

  it('rejects an account form that captured its balance before an automatic debit', async () => {
    const repository = createLocalRepository()
    await repository.saveAccount(account)
    await repository.saveRecurringPayment({ ...recurringPayment, type: 'expense', autoPost: true })
    await repository.postDueRecurring('2026-10-01')
    await expect(repository.saveAccount({ ...account, name: 'Changed name' }, 250000)).rejects.toThrow('余额已变更')
    expect((await subscribeOnce(createLocalRepository())).accounts[0]?.balanceCents).toBe(130000)
    await repository.saveAccount({ ...account, name: 'Changed name', balanceCents: 130000 }, 130000)
    expect((await subscribeOnce(createLocalRepository())).accounts[0]?.name).toBe('Changed name')
  })

  it('imports PDF rows once and preserves previously edited rows', async () => {
    const repository = createLocalRepository()
    const records = [{ ...transaction, id: 'pdf-one', source: 'pdf' as const },
      { ...transaction, id: 'pdf-two', source: 'pdf' as const, amountCents: 1234 }]
    await expect(repository.importTransactions(records)).resolves.toEqual({ inserted: 2, skipped: 0 })
    await repository.saveTransaction({ ...records[0]!, amountCents: 888 })
    await expect(createLocalRepository().importTransactions(records)).resolves.toEqual({ inserted: 0, skipped: 2 })
    const data = await subscribeOnce(createLocalRepository())
    expect(data.transactions).toHaveLength(2)
    expect(data.transactions[0]?.amountCents).toBe(888)
    await expect(repository.importTransactions([records[0]!, records[0]!])).rejects.toThrow('duplicate')
  })

  it('posts each due salary once, preserves edits, and does not recreate a deleted month', async () => {
    const repository = createLocalRepository()
    await repository.saveRecurringPayment({ ...recurringPayment,
      id: 'salary', name: 'Salary', type: 'income', autoPost: true,
      category: 'income', nextDueDate: '2026-10-01',
    })
    await repository.postDueRecurring('2026-11-01')
    let data = await subscribeOnce(createLocalRepository())
    expect(data.transactions.map(({ date, amountCents, source }) => ({ date, amountCents, source }))).toEqual([
      { date: '2026-10-01', amountCents: 120000, source: 'recurring' },
      { date: '2026-11-01', amountCents: 120000, source: 'recurring' },
    ])
    const october = data.transactions[0]!
    await repository.saveTransaction({ ...october, amountCents: 130000 })
    await repository.deleteTransaction(data.transactions[1]!.id)
    await repository.postDueRecurring('2026-11-28')
    data = await subscribeOnce(createLocalRepository())
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0]!.amountCents).toBe(130000)
    await repository.saveRecurringPayment({ ...data.recurringPayments[0]!, amountCents: 140000 })
    await repository.postDueRecurring('2026-12-01')
    data = await subscribeOnce(createLocalRepository())
    expect(data.transactions.map(({ date, amountCents }) => ({ date, amountCents }))).toEqual([
      { date: '2026-10-01', amountCents: 130000 },
      { date: '2026-12-01', amountCents: 140000 },
    ])
  })

  it('keeps posting progress when an older edit is saved after posting', async () => {
    const repository = createLocalRepository()
    const salary = { ...recurringPayment, id: 'salary', type: 'income' as const,
      autoPost: true, nextDueDate: '2026-10-01' }
    await repository.saveRecurringPayment(salary)
    await repository.postDueRecurring('2026-10-01')
    let data = await subscribeOnce(createLocalRepository())
    await repository.deleteTransaction(data.transactions[0]!.id)
    await repository.saveRecurringPayment({ ...salary, amountCents: 150_000 })
    await repository.postDueRecurring('2026-10-15')
    data = await subscribeOnce(createLocalRepository())
    expect(data.recurringPayments[0]!.lastPostedDate).toBe('2026-10-01')
    expect(data.transactions).toEqual([])
  })

  it('rejects changing a posted schedule while allowing its amount to change', async () => {
    const repository = createMemoryRepository({ transactions: [], accounts: [], recurringPayments: [] })
    const salary = { ...recurringPayment, type: 'income' as const, autoPost: true }
    await repository.saveRecurringPayment(salary)
    await repository.postDueRecurring('2026-10-01')
    await expect(repository.saveRecurringPayment({ ...salary, nextDueDate: '2026-08-01' }))
      .rejects.toThrow('首次收支日')
    await expect(repository.saveRecurringPayment({ ...salary, amountCents: 150_000 }))
      .resolves.toBeUndefined()
  })

  it('persists each record type and restores it in a new repository', async () => {
    const repository = createLocalRepository()

    await repository.saveTransaction(transaction)
    await repository.saveAccount(account)
    await repository.saveRecurringPayment(recurringPayment)

    await expect(subscribeOnce(createLocalRepository())).resolves.toEqual({
      transactions: [transaction],
      accounts: [account],
      recurringPayments: [recurringPayment],
    })
  })

  it('reports malformed stored data without overwriting it', () => {
    const malformed = '{"transactions":"not-an-array"}'
    localStorage.setItem(STORAGE_KEY, malformed)
    const onData = vi.fn()
    const onError = vi.fn()

    createLocalRepository().subscribe(onData, onError)

    expect(onData).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(malformed)
  })

  it('keeps subscriber state unchanged when browser storage rejects a write', async () => {
    const repository = createLocalRepository()
    const snapshots: FinanceData[] = []
    repository.subscribe((data) => snapshots.push(data), () => undefined)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    await expect(repository.saveTransaction(transaction)).rejects.toThrow('Quota exceeded')
    expect(snapshots).toEqual([
      { transactions: [], accounts: [], recurringPayments: [] },
    ])
  })

  it('rereads storage before writes from two repository instances', async () => {
    const firstRepository = createLocalRepository()
    const staleRepository = createLocalRepository()

    await firstRepository.saveTransaction(transaction)
    await staleRepository.saveAccount(account)

    await expect(subscribeOnce(createLocalRepository())).resolves.toEqual({
      transactions: [transaction],
      accounts: [account],
      recurringPayments: [],
    })
  })

  it('syncs a confirmed write received through the browser storage event', () => {
    const repository = createLocalRepository()
    const snapshots: FinanceData[] = []
    repository.subscribe((data) => snapshots.push(data), () => undefined)
    const externalData: FinanceData = {
      transactions: [transaction],
      accounts: [],
      recurringPayments: [],
    }
    const serialized = JSON.stringify(externalData)
    localStorage.setItem(STORAGE_KEY, serialized)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: serialized,
        storageArea: localStorage,
      }),
    )

    expect(snapshots).toEqual([
      { transactions: [], accounts: [], recurringPayments: [] },
      externalData,
    ])
  })

  it('does not apply stale data from a delayed browser storage event', async () => {
    const repository = createLocalRepository()
    const snapshots: FinanceData[] = []
    repository.subscribe((data) => snapshots.push(data), () => undefined)
    const externalData: FinanceData = {
      transactions: [transaction],
      accounts: [],
      recurringPayments: [],
    }
    const delayedEventValue = JSON.stringify(externalData)
    localStorage.setItem(STORAGE_KEY, delayedEventValue)
    await repository.saveAccount(account)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: delayedEventValue,
        storageArea: localStorage,
      }),
    )

    expect(snapshots.at(-1)).toEqual({
      transactions: [transaction],
      accounts: [account],
      recurringPayments: [],
    })
  })

  it('reports corruption introduced after startup and refuses to overwrite it', async () => {
    const repository = createLocalRepository()
    const snapshots: FinanceData[] = []
    const errors: Error[] = []
    repository.subscribe(
      (data) => snapshots.push(data),
      (error) => errors.push(error),
    )
    const malformed = '{"accounts":"invalid"}'
    localStorage.setItem(STORAGE_KEY, malformed)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: malformed,
        storageArea: localStorage,
      }),
    )

    await expect(repository.saveTransaction(transaction)).rejects.toThrow(
      'Invalid finance data',
    )
    expect(errors).toHaveLength(1)
    expect(snapshots).toHaveLength(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(malformed)
  })
})

describe('createMemoryRepository', () => {
  it('isolates its initial data and emitted snapshots from caller mutations', async () => {
    const initial: FinanceData = {
      transactions: [{ ...transaction }],
      accounts: [{ ...account }],
      recurringPayments: [{ ...recurringPayment }],
    }
    const repository = createMemoryRepository(initial)
    initial.transactions[0]!.merchant = 'Caller mutation'
    const emissions: FinanceData[] = []
    repository.subscribe((data) => emissions.push(data), () => undefined)
    emissions[0]!.transactions[0]!.merchant = 'Subscriber mutation'

    await repository.saveAccount({ ...account, id: 'account-2', name: 'Savings' })

    expect(emissions[1]).toEqual({
      transactions: [transaction],
      accounts: [account, { ...account, id: 'account-2', name: 'Savings' }],
      recurringPayments: [recurringPayment],
    })
  })

  it('notifies every active subscriber with independent snapshots', async () => {
    const repository = createMemoryRepository({
      transactions: [],
      accounts: [],
      recurringPayments: [],
    })
    const first: FinanceData[] = []
    const second: FinanceData[] = []
    const unsubscribeFirst = repository.subscribe((data) => first.push(data), () => undefined)
    repository.subscribe((data) => second.push(data), () => undefined)
    unsubscribeFirst()

    await repository.saveAccount(account)
    second[1]!.accounts[0]!.name = 'Mutated snapshot'
    repository.subscribe((data) => first.push(data), () => undefined)

    expect(first).toEqual([
      { transactions: [], accounts: [], recurringPayments: [] },
      { transactions: [], accounts: [account], recurringPayments: [] },
    ])
    expect(second).toHaveLength(2)
  })
})

describe('createFirestoreRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreMocks.getFirebaseServices.mockResolvedValue({ app: {}, auth: {}, db: {} })
  })

  it('commits expense, debit and progress together and never debits an existing period again', async () => {
    const listeners = new Map<string, (snapshot: { metadata: { hasPendingWrites: boolean }; docs: { id: string; data: () => unknown }[] }) => void>()
    firestoreMocks.onSnapshot.mockImplementation((ref: { path: string }, _options: unknown, next: typeof listeners extends Map<string, infer T> ? T : never) => {
      listeners.set(ref.path, next)
      return () => undefined
    })
    const plan = { ...recurringPayment, type: 'expense' as const, autoPost: true }
    const stored = new Map<string, Record<string, unknown>>([
      ['users/owner-1/recurring_payments/recurring-1', plan],
      ['users/owner-1/accounts/account-1', { ...account }],
      ['users/owner-1/transactions/auto_recurring-1_2026-10-01', { ...transaction,
        id: 'auto_recurring-1_2026-10-01', type: 'expense', amountCents: 120000 }],
    ])
    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, action: (tx: {
      get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: { path: string }, value: Record<string, unknown>) => void
    }) => Promise<number>) => {
      const changes = new Map<string, Record<string, unknown>>()
      const result = await action({
        get: async ({ path }) => {
          if (changes.size) throw new Error('Read after write')
          return { exists: () => stored.has(path), data: () => stored.get(path) }
        },
        set: ({ path }, value) => { changes.set(path, value) },
      })
      for (const [key, value] of changes) stored.set(key, value)
      return result
    })
    const repository = await createFirestoreRepository('owner-1')
    repository.subscribe(() => undefined, () => undefined)
    listeners.get('users/owner-1/recurring_payments')?.({ metadata: { hasPendingWrites: false },
      docs: [{ id: plan.id, data: () => plan }] })
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(2)
    expect(stored.get('users/owner-1/accounts/account-1')?.balanceCents).toBe(130000)
    expect(stored.get('users/owner-1/transactions/auto_recurring-1_2026-11-01')).toMatchObject({
      type: 'expense', amountCents: 120000, accountId: 'account-1', source: 'recurring',
    })
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(0)
    expect(stored.get('users/owner-1/accounts/account-1')?.balanceCents).toBe(130000)
    await expect(repository.postDueRecurring('2027-01-01')).rejects.toThrow('余额不足')
    expect(stored.get('users/owner-1/accounts/account-1')?.balanceCents).toBe(130000)
    expect(stored.get('users/owner-1/recurring_payments/recurring-1')?.lastPostedDate).toBe('2026-11-01')
  })

  it('imports cloud chunks without overwrite and reports completed progress on failure', async () => {
    const stored = new Map<string, Record<string, unknown>>([
      ['users/owner-1/transactions/pdf-0', { ...transaction, id: 'pdf-0', amountCents: 777, source: 'pdf' }],
    ])
    let attempts = 0
    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, action: (tx: {
      get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: { path: string }, value: Record<string, unknown>) => void
    }) => Promise<unknown>) => {
      attempts += 1
      if (attempts === 2) throw new Error('Disconnected')
      const changes = new Map<string, Record<string, unknown>>()
      const result = await action({
        get: async ({ path }) => ({ exists: () => stored.has(path), data: () => stored.get(path) }),
        set: ({ path }, value) => { changes.set(path, value) },
      })
      for (const [path, value] of changes) stored.set(path, value)
      return result
    })
    const repository = await createFirestoreRepository('owner-1')
    const records = Array.from({ length: 10 }, (_, i) => ({ ...transaction, id: `pdf-${i}`, source: 'pdf' as const }))
    await expect(repository.importTransactions(records)).rejects.toMatchObject({ result: { inserted: 7, skipped: 1 } })
    expect(stored.size).toBe(8)
    await expect(repository.importTransactions(records)).resolves.toEqual({ inserted: 2, skipped: 8 })
    expect(stored.get('users/owner-1/transactions/pdf-0')?.amountCents).toBe(777)
    expect(stored.size).toBe(10)
  })

  it('writes due cloud income and progress in one transaction, skipping existing periods', async () => {
    const listeners = new Map<string, (snapshot: {
      metadata: { hasPendingWrites: boolean }
      docs: { id: string; data: () => unknown }[]
    }) => void>()
    firestoreMocks.onSnapshot.mockImplementation((reference: { path: string }, _options: unknown, next: typeof listeners extends Map<string, infer T> ? T : never) => {
      listeners.set(reference.path, next)
      return () => undefined
    })
    const plan = { ...recurringPayment, id: 'salary', type: 'income' as const,
      autoPost: true, nextDueDate: '2026-10-01' }
    const stored = new Map<string, Record<string, unknown>>([
      ['users/owner-1/recurring_payments/salary', plan],
    ])
    firestoreMocks.runTransaction.mockImplementation(async (_db: unknown, action: (tx: {
      get: (ref: { path: string }) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: { path: string }, value: Record<string, unknown>) => void
    }) => Promise<number>) => {
      const changes = new Map<string, Record<string, unknown>>()
      const result = await action({
        get: async ({ path }) => ({ exists: () => stored.has(path), data: () => stored.get(path) }),
        set: ({ path }, value) => { changes.set(path, value) },
      })
      for (const [key, value] of changes) stored.set(key, value)
      return result
    })
    const repository = await createFirestoreRepository('owner-1')
    repository.subscribe(() => undefined, () => undefined)
    listeners.get('users/owner-1/recurring_payments')?.({
      metadata: { hasPendingWrites: false }, docs: [{ id: 'salary', data: () => plan }],
    })
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(2)
    expect([...stored.keys()].filter((path) => path.includes('/transactions/'))).toHaveLength(2)
    expect(stored.get('users/owner-1/recurring_payments/salary')?.lastPostedDate).toBe('2026-11-01')
    await repository.saveRecurringPayment({ ...plan, amountCents: 175_000 })
    expect(stored.get('users/owner-1/recurring_payments/salary')).toMatchObject({
      amountCents: 175_000, lastPostedDate: '2026-11-01',
    })
    await expect(repository.postDueRecurring('2026-11-01')).resolves.toBe(0)
    expect([...stored.keys()].filter((path) => path.includes('/transactions/'))).toHaveLength(2)
  })

  it('waits for confirmed snapshots from all collections before emitting', async () => {
    const listeners = new Map<
      string,
      (snapshot: {
        metadata: { hasPendingWrites: boolean }
        docs: { id: string; data: () => unknown }[]
      }) => void
    >()
    firestoreMocks.onSnapshot.mockImplementation(
      (
        reference: { path: string },
        _options: unknown,
        next: (snapshot: {
          metadata: { hasPendingWrites: boolean }
          docs: { id: string; data: () => unknown }[]
        }) => void,
      ) => {
        listeners.set(reference.path, next)
        return () => undefined
      },
    )
    const repository = await createFirestoreRepository('owner-1')
    const onData = vi.fn()
    repository.subscribe(onData, () => undefined)

    listeners.get('users/owner-1/transactions')?.({
      metadata: { hasPendingWrites: true },
      docs: [{ id: transaction.id, data: () => transaction }],
    })
    listeners.get('users/owner-1/accounts')?.({
      metadata: { hasPendingWrites: false },
      docs: [{ id: account.id, data: () => account }],
    })
    listeners.get('users/owner-1/recurring_payments')?.({
      metadata: { hasPendingWrites: false },
      docs: [{ id: recurringPayment.id, data: () => recurringPayment }],
    })
    expect(onData).not.toHaveBeenCalled()

    listeners.get('users/owner-1/transactions')?.({
      metadata: { hasPendingWrites: false },
      docs: [{ id: transaction.id, data: () => transaction }],
    })

    expect(onData).toHaveBeenCalledOnce()
    expect(onData).toHaveBeenCalledWith({
      transactions: [transaction],
      accounts: [account],
      recurringPayments: [recurringPayment],
    })
  })

  it('reports a stored document whose field id differs from its document id', async () => {
    let transactionListener:
      | ((snapshot: {
          metadata: { hasPendingWrites: boolean }
          docs: { id: string; data: () => unknown }[]
        }) => void)
      | undefined
    firestoreMocks.onSnapshot.mockImplementation(
      (
        reference: { path: string },
        _options: unknown,
        next: typeof transactionListener,
      ) => {
        if (reference.path.endsWith('/transactions')) transactionListener = next
        return () => undefined
      },
    )
    const repository = await createFirestoreRepository('owner-1')
    const onError = vi.fn()
    repository.subscribe(() => undefined, onError)

    expect(() =>
      transactionListener?.({
        metadata: { hasPendingWrites: false },
        docs: [{ id: 'other-id', data: () => transaction }],
      }),
    ).not.toThrow()
    expect(onError).toHaveBeenCalledOnce()
  })
})
