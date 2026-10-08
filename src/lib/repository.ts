import { tr } from './i18n'
import type { Account, FinanceData, RecurringPayment, Transaction } from '../types/finance'
import { emptyFinanceData } from '../types/finance'
import { getFirebaseServices } from './firebase'
import { dueRecurringDates, MAX_RECORD_AMOUNT_CENTS, validateFinanceData } from './finance'

export interface FinanceRepository {
  subscribe(
    onData: (data: FinanceData) => void,
    onError: (error: Error) => void,
  ): () => void
  saveTransaction(transaction: Transaction): Promise<void>
  deleteTransaction(id: string): Promise<void>
  saveAccount(account: Account, expectedBalanceCents?: number): Promise<void>
  deleteAccount(id: string): Promise<void>
  saveRecurringPayment(payment: RecurringPayment): Promise<void>
  deleteRecurringPayment(id: string): Promise<void>
  postDueRecurring(today: string): Promise<number>
  importTransactions(records: Transaction[]): Promise<ImportResult>
}

export interface ImportResult { inserted: number; skipped: number }
export class ImportFailure extends Error {
  readonly result: ImportResult
  constructor(result: ImportResult, cause: unknown) {
    super(tr("导入中断：{0}。已新增 {1} 笔、跳过 {2} 笔；可以重试。", [asError(cause).message, result.inserted, result.skipped]))
    this.result = { ...result }
  }
}

export class RecurringPostingFailure extends Error {
  readonly processed: number
  constructor(processed: number, messages: string[]) {
    super(messages.join('\n'))
    this.processed = processed
  }
}

const LOCAL_STORAGE_KEY = 'financial-summary:v1:data'

type Subscriber = {
  onData: (data: FinanceData) => void
  onError: (error: Error) => void
}

type DataUpdater = (currentData: FinanceData) => FinanceData
type CommitData = (update: DataUpdater) => Promise<FinanceData>
type ExternalDataSource = (
  onData: (data: FinanceData) => void,
  onError: (error: Error) => void,
) => () => void

function cloneData(data: FinanceData): FinanceData {
  return {
    transactions: data.transactions.map((record) => ({ ...record })),
    accounts: data.accounts.map((record) => ({ ...record })),
    recurringPayments: data.recurringPayments.map((record) => ({ ...record })),
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function replaceById<T extends { id: string }>(records: T[], record: T): T[] {
  const index = records.findIndex(({ id }) => id === record.id)
  if (index === -1) return [...records, { ...record }]
  return records.map((existing, itemIndex) =>
    itemIndex === index ? { ...record } : existing,
  )
}

function mergeRecurringPayment(
  payment: RecurringPayment, current?: RecurringPayment,
): RecurringPayment {
  if (current?.lastPostedDate && (
    payment.nextDueDate !== current.nextDueDate ||
    payment.frequency !== current.frequency ||
    (payment.type ?? 'expense') !== (current.type ?? 'expense')
  )) {
    throw new Error(tr("已有自动记账记录后不能修改类型、频率或首次收支日；请停用旧计划并新建计划。"))
  }
  const lastPostedDate = [current?.lastPostedDate, payment.lastPostedDate]
    .filter((date): date is string => Boolean(date)).sort().at(-1)
  return {
    ...payment,
    ...(lastPostedDate ? { lastPostedDate } : {}),
  }
}

function scheduledRecord(plan: RecurringPayment, date: string, now: string): Transaction {
  const id = `auto_${plan.id}_${date}`
  if (id.length > 128) throw new Error(tr("计划 ID 过长，无法自动记账。"))
  return {
    id, date, merchant: plan.name, amountCents: plan.amountCents,
    type: plan.type ?? 'expense', category: plan.category, accountId: plan.accountId,
    note: plan.type === 'income' ? tr("由固定收入计划自动生成") : tr("由固定支出计划自动扣账生成"), source: 'recurring',
    createdAt: now, updatedAt: now,
  }
}

function debitAccount(account: Account | undefined, amountCents: number, plan: RecurringPayment, now: string): Account {
  if (!account) throw new Error(tr("{0}：扣款账户不存在，请重新选择账户。", [plan.name]))
  if (account.type === 'loan') throw new Error(tr("{0}：贷款账户不能作为扣款账户，请选择付款的现金账户。", [plan.name]))
  const balanceCents = account.balanceCents + (account.type === 'credit' ? amountCents : -amountCents)
  if (balanceCents < 0) throw new Error(tr("{0}：{1} 余额不足，本轮补记未执行；此前已完成的扣账保留。", [plan.name, account.name]))
  if (!Number.isSafeInteger(balanceCents) || balanceCents > MAX_RECORD_AMOUNT_CENTS) {
    throw new Error(tr("{0}：扣账后的账户金额超出允许范围。", [plan.name]))
  }
  return { ...account, balanceCents, updatedAt: now }
}

function accountIsInUse(data: FinanceData, id: string): boolean {
  return (
    data.transactions.some(({ accountId }) => accountId === id) ||
    data.recurringPayments.some(({ accountId }) => accountId === id)
  )
}

function createMutableRepository(
  initialData: FinanceData,
  commit?: CommitData,
  externalDataSource?: ExternalDataSource,
): FinanceRepository {
  let data = cloneData(initialData)
  const subscribers = new Set<Subscriber>()
  let stopExternalDataSource: (() => void) | undefined

  const notify = () => {
    for (const { onData } of subscribers) onData(cloneData(data))
  }

  const notifyError = (error: Error) => {
    for (const { onError } of subscribers) onError(error)
  }

  const update = async (updater: DataUpdater) => {
    const nextData = commit
      ? await commit(updater)
      : validateFinanceData(updater(cloneData(data)))
    data = cloneData(nextData)
    notify()
  }

  return {
    subscribe(onData, onError) {
      const subscriber = { onData, onError }
      subscribers.add(subscriber)
      if (subscribers.size === 1 && externalDataSource) {
        stopExternalDataSource = externalDataSource(
          (externalData) => {
            data = cloneData(externalData)
            notify()
          },
          notifyError,
        )
      }
      onData(cloneData(data))
      return () => {
        subscribers.delete(subscriber)
        if (subscribers.size === 0) {
          stopExternalDataSource?.()
          stopExternalDataSource = undefined
        }
      }
    },
    saveTransaction(transaction) {
      return update((currentData) => ({
        ...currentData,
        transactions: replaceById(currentData.transactions, transaction),
      }))
    },
    async importTransactions(records) {
      validateFinanceData({ ...emptyFinanceData(), transactions: records })
      const result = { inserted: 0, skipped: 0 }
      await update(currentData => {
        const ids = new Set(currentData.transactions.map(t => t.id))
        const additions = records.filter(t => !ids.has(t.id))
        result.inserted = additions.length
        result.skipped = records.length - additions.length
        return { ...currentData, transactions: [...currentData.transactions, ...additions] }
      })
      return result
    },
    deleteTransaction(id) {
      return update((currentData) => ({
        ...currentData,
        transactions: currentData.transactions.filter((record) => record.id !== id),
      }))
    },
    saveAccount(account, expectedBalanceCents) {
      return update((currentData) => {
        if (expectedBalanceCents !== undefined &&
          currentData.accounts.find(value => value.id === account.id)?.balanceCents !== expectedBalanceCents) {
          throw new Error(tr("账户余额已变更，请关闭表单并重新打开后修改。"))
        }
        return { ...currentData, accounts: replaceById(currentData.accounts, account) }
      })
    },
    async deleteAccount(id) {
      await update((currentData) => {
        if (accountIsInUse(currentData, id)) {
          throw new Error('Cannot delete an account used by transactions or recurring payments.')
        }
        return {
          ...currentData,
          accounts: currentData.accounts.filter((record) => record.id !== id),
        }
      })
    },
    saveRecurringPayment(payment) {
      return update((currentData) => ({
        ...currentData,
        recurringPayments: replaceById(
          currentData.recurringPayments,
          mergeRecurringPayment(payment, currentData.recurringPayments.find(({ id }) => id === payment.id)),
        ),
      }))
    },
    deleteRecurringPayment(id) {
      return update((currentData) => ({
        ...currentData,
        recurringPayments: currentData.recurringPayments.filter(
          (record) => record.id !== id,
        ),
      }))
    },
    async postDueRecurring(today) {
      let processed = 0
      const errors: string[] = []
      for (const id of data.recurringPayments.map(plan => plan.id)) {
        const currentPlan = data.recurringPayments.find(plan => plan.id === id)
        if (!currentPlan || !dueRecurringDates(currentPlan, today).length) continue
        try {
          let count = 0
          await update(currentData => {
            const plan = currentData.recurringPayments.find(plan => plan.id === id)
            if (!plan) return currentData
            const dates = dueRecurringDates(plan, today)
            if (!dates.length) return currentData
            const now = new Date().toISOString()
            const additions = dates.map(date => scheduledRecord(plan, date, now))
              .filter(record => !currentData.transactions.some(existing => existing.id === record.id))
            const amountCents = additions.reduce((sum, record) => sum + record.amountCents, 0)
            const accounts = amountCents && plan.type !== 'income'
              ? replaceById(currentData.accounts, debitAccount(currentData.accounts.find(account => account.id === plan.accountId), amountCents, plan, now))
              : currentData.accounts
            count = dates.length
            return {
              ...currentData, accounts,
              transactions: [...currentData.transactions, ...additions],
              recurringPayments: replaceById(currentData.recurringPayments, { ...plan, lastPostedDate: dates.at(-1)!, updatedAt: now }),
            }
          })
          processed += count
        } catch (error) { errors.push(asError(error).message) }
      }
      if (errors.length) throw new RecurringPostingFailure(processed, errors)
      return processed
    },
  }
}

function readLocalData(serialized = localStorage.getItem(LOCAL_STORAGE_KEY)): FinanceData {
  return serialized === null
    ? emptyFinanceData()
    : validateFinanceData(JSON.parse(serialized))
}

async function withLocalStorageLock<T>(action: () => T): Promise<T> {
  if (navigator.locks) {
    return navigator.locks.request(LOCAL_STORAGE_KEY, action)
  }
  return action()
}

export function createLocalRepository(): FinanceRepository {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
  let initialData: FinanceData
  try {
    initialData = readLocalData(stored)
  } catch (error) {
    const storedDataError = asError(error)
    const reject = async () => {
      throw storedDataError
    }
    return {
      subscribe(_onData, onError) {
        onError(storedDataError)
        return () => undefined
      },
      saveTransaction: reject,
      importTransactions: reject,
      deleteTransaction: reject,
      saveAccount: reject,
      deleteAccount: reject,
      saveRecurringPayment: reject,
      deleteRecurringPayment: reject,
      postDueRecurring: reject,
    }
  }

  return createMutableRepository(
    initialData,
    (updater) =>
      withLocalStorageLock(() => {
        const storedBeforeUpdate = localStorage.getItem(LOCAL_STORAGE_KEY)
        const latestData = readLocalData(storedBeforeUpdate)
        const nextData = validateFinanceData(updater(cloneData(latestData)))
        if (localStorage.getItem(LOCAL_STORAGE_KEY) !== storedBeforeUpdate) {
          throw new Error('Local finance data changed during this write. Please try again.')
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextData))
        return nextData
      }),
    (onData, onError) => {
      const handleStorage = (event: StorageEvent) => {
        if (
          (event.key !== LOCAL_STORAGE_KEY && event.key !== null) ||
          (event.storageArea !== null && event.storageArea !== localStorage)
        ) {
          return
        }
        try {
          onData(readLocalData())
        } catch (error) {
          onError(asError(error))
        }
      }
      window.addEventListener('storage', handleStorage)
      return () => window.removeEventListener('storage', handleStorage)
    },
  )
}

export function createMemoryRepository(initialData: FinanceData): FinanceRepository {
  return createMutableRepository(validateFinanceData(cloneData(initialData)))
}

export async function createFirestoreRepository(uid: string): Promise<FinanceRepository> {
  if (uid.trim().length === 0) throw new Error('A Firebase user ID is required.')

  const firestore = await import('firebase/firestore')
  const { db } = await getFirebaseServices()
  if (!db) throw new Error('Firebase is not configured.')

  let recurringPlanIds: string[] = []

  const collectionNames = [
    'transactions',
    'accounts',
    'recurring_payments',
  ] as const

  const documentRef = (collectionName: (typeof collectionNames)[number], id: string) =>
    firestore.doc(db, 'users', uid, collectionName, id)

  const assertValidRecord = (
    collectionName: (typeof collectionNames)[number],
    record: Transaction | Account | RecurringPayment,
  ) => {
    const candidate = emptyFinanceData()
    if (collectionName === 'transactions') candidate.transactions = [record as Transaction]
    if (collectionName === 'accounts') candidate.accounts = [record as Account]
    if (collectionName === 'recurring_payments') {
      candidate.recurringPayments = [record as RecurringPayment]
    }
    validateFinanceData(candidate)
  }

  const save = async (
    collectionName: (typeof collectionNames)[number],
    record: Transaction | Account | RecurringPayment,
  ) => {
    assertValidRecord(collectionName, record)
    await firestore.setDoc(documentRef(collectionName, record.id), { ...record })
  }

  const remove = async (
    collectionName: (typeof collectionNames)[number],
    id: string,
  ) => {
    if (id.trim().length === 0) throw new Error('A record ID is required.')
    await firestore.deleteDoc(documentRef(collectionName, id))
  }

  return {
    subscribe(onData, onError) {
      const records: Partial<FinanceData> = {}
      const ready = new Set<(typeof collectionNames)[number]>()
      let stopped = false
      let failed = false

      const fail = (error: unknown) => {
        if (stopped || failed) return
        failed = true
        onError(asError(error))
      }

      const emitIfReady = () => {
        if (failed || ready.size !== collectionNames.length) return
        try {
          onData(
            cloneData(
              validateFinanceData({
                transactions: records.transactions,
                accounts: records.accounts,
                recurringPayments: records.recurringPayments,
              }),
            ),
          )
        } catch (error) {
          fail(error)
        }
      }

      const unsubscribes = collectionNames.map((collectionName) =>
        firestore.onSnapshot(
          firestore.collection(db, 'users', uid, collectionName),
          { includeMetadataChanges: true },
          (snapshot) => {
            try {
              if (snapshot.metadata.hasPendingWrites) return
              const collectionRecords = snapshot.docs.map((snapshotDocument) => {
                const record = snapshotDocument.data() as { id?: unknown }
                if (record.id !== snapshotDocument.id) {
                  throw new Error(
                    `Invalid finance data: ${collectionName} document ID does not match its id field`,
                  )
                }
                return record
              })
              if (collectionName === 'transactions') {
                records.transactions = collectionRecords as unknown as Transaction[]
              } else if (collectionName === 'accounts') {
                records.accounts = collectionRecords as unknown as Account[]
              } else {
                records.recurringPayments = collectionRecords as unknown as RecurringPayment[]
                recurringPlanIds = collectionRecords.map((record) => record.id as string)
              }
              ready.add(collectionName)
              emitIfReady()
            } catch (error) {
              fail(error)
            }
          },
          fail,
        ),
      )

      return () => {
        stopped = true
        for (const unsubscribe of unsubscribes) unsubscribe()
      }
    },
    saveTransaction(transaction) {
      return save('transactions', transaction)
    },
    async importTransactions(records) {
      validateFinanceData({ ...emptyFinanceData(), transactions: records })
      const result = { inserted: 0, skipped: 0 }
      try {
        for (let index = 0; index < records.length; index += 8) {
          const chunk = records.slice(index, index + 8)
          const done = await firestore.runTransaction(db, async transaction => {
            const refs = chunk.map(t => documentRef('transactions', t.id))
            const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
            let inserted = 0
            snapshots.forEach((snapshot, n) => {
              if (!snapshot.exists()) {
                transaction.set(refs[n], { ...chunk[n] })
                inserted += 1
              }
            })
            return { inserted, skipped: chunk.length - inserted }
          })
          result.inserted += done.inserted
          result.skipped += done.skipped
        }
        return result
      } catch (error) {
        throw new ImportFailure(result, error)
      }
    },
    deleteTransaction(id) {
      return remove('transactions', id)
    },
    saveAccount(account, expectedBalanceCents) {
      if (expectedBalanceCents === undefined) return save('accounts', account)
      return firestore.runTransaction(db, async transaction => {
        const ref = documentRef('accounts', account.id)
        const current = await transaction.get(ref)
        if (!current.exists() || (current.data() as Account).balanceCents !== expectedBalanceCents) {
          throw new Error(tr("账户余额已变更，请关闭表单并重新打开后修改。"))
        }
        assertValidRecord('accounts', account)
        transaction.set(ref, { ...account })
      })
    },
    async deleteAccount(id) {
      const [transactionMatches, recurringMatches] = await Promise.all([
        firestore.getDocs(
          firestore.query(
            firestore.collection(db, 'users', uid, 'transactions'),
            firestore.where('accountId', '==', id),
            firestore.limit(1),
          ),
        ),
        firestore.getDocs(
          firestore.query(
            firestore.collection(db, 'users', uid, 'recurring_payments'),
            firestore.where('accountId', '==', id),
            firestore.limit(1),
          ),
        ),
      ])
      if (!transactionMatches.empty || !recurringMatches.empty) {
        throw new Error('Cannot delete an account used by transactions or recurring payments.')
      }
      await remove('accounts', id)
    },
    saveRecurringPayment(payment) {
      return firestore.runTransaction(db, async (transaction) => {
        const reference = documentRef('recurring_payments', payment.id)
        const snapshot = await transaction.get(reference)
        const current = snapshot.exists() ? snapshot.data() as RecurringPayment : undefined
        const updated = mergeRecurringPayment(payment, current)
        assertValidRecord('recurring_payments', updated)
        transaction.set(reference, updated)
      })
    },
    deleteRecurringPayment(id) {
      return remove('recurring_payments', id)
    },
    async postDueRecurring(today) {
      let posted = 0
      const errors: string[] = []
      for (const id of recurringPlanIds) {
        try {
        posted += await firestore.runTransaction(db, async (transaction) => {
          const planRef = documentRef('recurring_payments', id)
          const planSnapshot = await transaction.get(planRef)
          if (!planSnapshot.exists()) return 0
          const plan = planSnapshot.data() as RecurringPayment
          const dates = dueRecurringDates(plan, today)
          if (!dates.length) return 0
          const now = new Date().toISOString()
          const records = dates.map((date) => scheduledRecord(plan, date, now))
          const refs = records.map((record) => documentRef('transactions', record.id))
          const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
          const amountCents = records.reduce((sum, record, index) => sum + (snapshots[index]!.exists() ? 0 : record.amountCents), 0)
          const accountRef = amountCents && plan.type !== 'income' ? documentRef('accounts', plan.accountId) : undefined
          const accountSnapshot = accountRef ? await transaction.get(accountRef) : undefined
          const updatedAccount = accountRef
            ? debitAccount(accountSnapshot?.exists() ? accountSnapshot.data() as Account : undefined, amountCents, plan, now)
            : undefined
          if (updatedAccount) assertValidRecord('accounts', updatedAccount)
          records.forEach((record, index) => {
            if (!snapshots[index]!.exists()) {
              assertValidRecord('transactions', record)
              transaction.set(refs[index]!, record)
            }
          })
          const updated = { ...plan, lastPostedDate: dates.at(-1)!, updatedAt: now }
          assertValidRecord('recurring_payments', updated)
          transaction.set(planRef, updated)
          if (accountRef && updatedAccount) transaction.set(accountRef, updatedAccount)
          return dates.length
        })
        } catch (error) { errors.push(asError(error).message) }
      }
      if (errors.length) throw new RecurringPostingFailure(posted, errors)
      return posted
    },
  }
}
