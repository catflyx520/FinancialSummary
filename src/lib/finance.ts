import { tr } from './i18n'
import type {
  Account,
  AccountType,
  FinanceData,
  RecurringFrequency,
  RecurringPayment,
  Transaction,
  TransactionType,
} from '../types/finance'

export const categories: { id: string; label: string; color: string }[] = [
  { id: 'housing', get label() { return tr("住房") }, color: '#526f5b' },
  { id: 'food', get label() { return tr("餐饮") }, color: '#b88155' },
  { id: 'groceries', get label() { return tr("日常杂货") }, color: '#879b58' },
  { id: 'transportation', get label() { return tr("交通") }, color: '#628177' },
  { id: 'car_payment', get label() { return tr("车贷") }, color: '#8b7359' },
  { id: 'utilities', get label() { return tr("水电与账单") }, color: '#778b80' },
  { id: 'insurance', get label() { return tr("保险") }, color: '#6f8968' },
  { id: 'subscription', get label() { return tr("订阅") }, color: '#9b765f' },
  { id: 'shopping', get label() { return tr("购物") }, color: '#a77865' },
  { id: 'health', get label() { return tr("医疗健康") }, color: '#648d72' },
  { id: 'entertainment', get label() { return tr("娱乐") }, color: '#b58a52' },
  { id: 'education', get label() { return tr("教育") }, color: '#7b8062' },
  { id: 'travel', get label() { return tr("旅行") }, color: '#517f70' },
  { id: 'income', get label() { return tr("收入") }, color: '#3f8054' },
  { id: 'other', get label() { return tr("其他") }, color: '#858d82' },
]

export const MAX_RECORD_AMOUNT_CENTS = 100_000_000_000

export const accountTypes: Record<AccountType, string> = {
  get checking() { return tr("支票账户") },
  get savings() { return tr("储蓄账户") },
  get credit() { return tr("信用卡") },
  get investment() { return tr("投资账户") },
  get retirement() { return tr("退休账户") },
  get loan() { return tr("贷款") },
  get other() { return tr("其他") },
}

export const frequencies: Record<RecurringFrequency, string> = {
  get weekly() { return tr("每周") },
  get monthly() { return tr("每月") },
  get quarterly() { return tr("每季度") },
  get yearly() { return tr("每年") },
}

export const transactionTypes: Record<TransactionType, string> = {
  get income() { return tr("收入") },
  get expense() { return tr("支出") },
  get refund() { return tr("退款（收入）") },
  get transfer() { return tr("转账 / 还款") },
}

const transactionTypeValues = new Set<TransactionType>([
  'income',
  'expense',
  'refund',
  'transfer',
])
const accountTypeValues = new Set<AccountType>([
  'checking',
  'savings',
  'credit',
  'investment',
  'retirement',
  'loan',
  'other',
])
const frequencyValues = new Set<RecurringFrequency>([
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
])

const invalidAmount = (): never => {
  throw new Error('Invalid amount')
}

export function parseMoney(value: string): number {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return invalidAmount()

  const sign = match[1] === '-' ? -1n : 1n
  const dollars = BigInt(match[2]!)
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const cents = sign * (dollars * 100n + BigInt(fraction || '0'))
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    invalidAmount()
  }
  return Number(cents)
}

const isSafeCents = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

export function formatMoney(cents: number): string {
  if (!isSafeCents(cents)) {
    throw new Error('Invalid cents')
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export function localDate(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days[month - 1] ?? 0
}

const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

const isCalendarMonth = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  return year >= 1 && month >= 1 && month <= 12
}

export function summarizeMonth(transactions: Transaction[], month: string): {
  incomeCents: number
  expenseCents: number
  netCents: number
  transactionCount: number
  categories: { category: string; amountCents: number }[]
} {
  if (!isCalendarMonth(month)) {
    throw new Error('Invalid month')
  }

  const inMonth = transactions.filter(({ date }) => date.slice(0, 7) === month)
  let incomeCents = 0
  let expenseCents = 0
  const categoryTotals = new Map<string, number>()

  for (const item of inMonth) {
    if (item.type === 'income' || item.type === 'refund') {
      incomeCents += item.amountCents
    } else if (item.type === 'expense') {
      expenseCents += item.amountCents
      categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amountCents)
    }
  }

  const categorySummary = [...categoryTotals.entries()]
    .filter(([, amountCents]) => amountCents !== 0)
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category))

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    transactionCount: inMonth.length,
    categories: categorySummary,
  }
}

export function summarizeAccounts(accounts: Account[]): {
  assetsCents: number
  liabilitiesCents: number
  netWorthCents: number
} {
  let assetsCents = 0
  let liabilitiesCents = 0
  for (const item of accounts) {
    if (item.type === 'credit' || item.type === 'loan') {
      liabilitiesCents += item.balanceCents
    } else {
      assetsCents += item.balanceCents
    }
  }
  return {
    assetsCents,
    liabilitiesCents,
    netWorthCents: assetsCents - liabilitiesCents,
  }
}

export function isRecurringActive(payment: RecurringPayment, today = localDate()): boolean {
  return payment.active && (!payment.endDate || payment.endDate >= today)
}

/** Calculate from the original anchor so February never shifts a 31st schedule. */
export function nextRecurringDate(payment: RecurringPayment, today = localDate()): string | null {
  if (!isRecurringActive(payment, today)) return null
  const anchor = payment.nextDueDate
  let due = anchor
  if (due < today) {
    const start = new Date(`${anchor}T00:00:00Z`)
    if (payment.frequency === 'weekly') {
      const elapsed = new Date(`${today}T00:00:00Z`).getTime() - start.getTime()
      start.setUTCDate(start.getUTCDate() + Math.ceil(elapsed / 604800000) * 7)
      due = start.toISOString().slice(0, 10)
    } else {
      const months = payment.frequency === 'monthly' ? 1 : payment.frequency === 'quarterly' ? 3 : 12
      const [year, month] = today.split('-').map(Number)
      const elapsed = (year! - start.getUTCFullYear()) * 12 + month! - 1 - start.getUTCMonth()
      const cycle = Math.floor(elapsed / months)
      const dateForCycle = (n: number) => {
        const target = new Date(start)
        target.setUTCDate(1)
        target.setUTCMonth(target.getUTCMonth() + n * months)
        const last = new Date(target)
        last.setUTCMonth(last.getUTCMonth() + 1)
        last.setUTCDate(0)
        target.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()))
        return target.toISOString().slice(0, 10)
      }
      due = dateForCycle(cycle)
      if (due < today) due = dateForCycle(cycle + 1)
    }
  }
  if (!isCalendarDate(due) || (payment.endDate && due > payment.endDate)) return null
  return due
}

export function upcomingRecurringDate(plan: RecurringPayment, today = localDate()): string | null {
  if (!plan.autoPost || !plan.lastPostedDate) {
    return nextRecurringDate(plan, today)
  }
  const afterPosted = new Date(`${plan.lastPostedDate}T00:00:00Z`)
  afterPosted.setUTCDate(afterPosted.getUTCDate() + 1)
  const cursor = afterPosted.toISOString().slice(0, 10)
  return nextRecurringDate(plan, cursor > today ? cursor : today)
}

export function dueIncomeDates(plan: RecurringPayment, today = localDate(), limit = 8): string[] {
  return plan.type === 'income' ? dueRecurringDates(plan, today, limit) : []
}

export function dueRecurringDates(plan: RecurringPayment, today = localDate(), limit = 8): string[] {
  if (!plan.autoPost || !plan.active) return []
  const dates: string[] = []
  const cursor = new Date(`${plan.lastPostedDate ?? plan.nextDueDate}T00:00:00Z`)
  if (plan.lastPostedDate) cursor.setUTCDate(cursor.getUTCDate() + 1)
  let next = nextRecurringDate(plan, cursor.toISOString().slice(0, 10))
  while (next && next <= today && dates.length < limit) {
    dates.push(next)
    const following = new Date(`${next}T00:00:00Z`)
    following.setUTCDate(following.getUTCDate() + 1)
    next = nextRecurringDate(plan, following.toISOString().slice(0, 10))
  }
  return dates
}

export function monthlyRecurringCents(
  payments: RecurringPayment[], today = localDate(), type: 'income' | 'expense' = 'expense',
): number {
  let twelfths = 0n
  for (const payment of payments) {
    if (!isRecurringActive(payment, today) || (payment.type ?? 'expense') !== type) continue
    const amount = BigInt(payment.amountCents)
    if (payment.frequency === 'weekly') twelfths += amount * 52n
    else if (payment.frequency === 'monthly') twelfths += amount * 12n
    else if (payment.frequency === 'quarterly') twelfths += amount * 4n
    else twelfths += amount
  }

  const rounded = (twelfths + 6n) / 12n
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Recurring total exceeds safe cents')
  }
  return Number(rounded)
}

const protectSpreadsheetCell = (value: string): string =>
  /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value

const csvCell = (value: string): string => {
  const protectedValue = protectSpreadsheetCell(value)
  return /[",\r\n]/.test(protectedValue)
    ? `"${protectedValue.replaceAll('"', '""')}"`
    : protectedValue
}

export function transactionsCsv(transactions: Transaction[]): string {
  const rows = [
    ['Date', 'Merchant', 'Amount (USD)', 'Type', 'Category', 'Account', 'Note'],
    ...transactions.map((item) => [
      item.date,
      item.merchant,
      (item.amountCents / 100).toFixed(2),
      item.type,
      item.category,
      item.accountId,
      item.note,
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && keys.every((key) => key in value)
}

const isRequiredText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum

const isId = (value: unknown): value is string =>
  isRequiredText(value, 128) && value === value.trim() && !value.includes('/')

const isAccountId = (value: unknown): value is string =>
  value === '' || isId(value)

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.exec(value)
  if (!match) return false
  if (!isCalendarDate(match[1])) return false

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

const hasValidTimestamps = (value: Record<string, unknown>): boolean =>
  isTimestamp(value.createdAt) && isTimestamp(value.updatedAt)

const transactionKeys = [
  'id',
  'date',
  'merchant',
  'amountCents',
  'type',
  'category',
  'accountId',
  'note',
  'source',
  'createdAt',
  'updatedAt',
] as const

const accountKeys = [
  'id',
  'name',
  'type',
  'balanceCents',
  'currency',
  'updatedAt',
] as const

const recurringPaymentKeys = [
  'id',
  'name',
  'category',
  'amountCents',
  'frequency',
  'nextDueDate',
  'accountId',
  'autoPay',
  'active',
  'createdAt',
  'updatedAt',
] as const

const isRecordAmount = (value: unknown, allowZero: boolean): value is number =>
  isSafeCents(value) &&
  (allowZero ? value >= 0 : value > 0) &&
  value <= MAX_RECORD_AMOUNT_CENTS

const isTransaction = (value: unknown): value is Transaction => {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, transactionKeys) &&
    isId(value.id) &&
    isCalendarDate(value.date) &&
    isRequiredText(value.merchant, 120) &&
    isRecordAmount(value.amountCents, false) &&
    transactionTypeValues.has(value.type as TransactionType) &&
    isRequiredText(value.category, 80) &&
    isAccountId(value.accountId) &&
    typeof value.note === 'string' && value.note.length <= 500 &&
    (value.source === 'manual' || value.source === 'csv' || value.source === 'recurring' || value.source === 'pdf') &&
    hasValidTimestamps(value)
  )
}

const isAccount = (value: unknown): value is Account => {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, accountKeys) &&
    isId(value.id) &&
    isRequiredText(value.name, 120) &&
    accountTypeValues.has(value.type as AccountType) &&
    isRecordAmount(value.balanceCents, true) &&
    value.currency === 'USD' &&
    isTimestamp(value.updatedAt)
  )
}

const isRecurringPayment = (value: unknown): value is RecurringPayment => {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, [
      ...recurringPaymentKeys,
      ...(['endDate', 'type', 'autoPost', 'lastPostedDate'] as const).filter((key) => key in value),
    ]) &&
    (!('endDate' in value) || value.endDate === '' ||
      (isCalendarDate(value.endDate) && typeof value.nextDueDate === 'string' && value.endDate >= value.nextDueDate)) &&
    (!('type' in value) || value.type === 'income' || value.type === 'expense') &&
    (!('autoPost' in value) || (typeof value.autoPost === 'boolean' &&
      (!value.autoPost || value.type === 'income' ||
        (value.type === 'expense' && typeof value.accountId === 'string' && value.accountId.length > 0)))) &&
    (!('lastPostedDate' in value) || isCalendarDate(value.lastPostedDate)) &&
    isId(value.id) &&
    isRequiredText(value.name, 120) &&
    isRequiredText(value.category, 80) &&
    isRecordAmount(value.amountCents, false) &&
    frequencyValues.has(value.frequency as RecurringFrequency) &&
    isCalendarDate(value.nextDueDate) &&
    isAccountId(value.accountId) &&
    typeof value.autoPay === 'boolean' &&
    typeof value.active === 'boolean' &&
    hasValidTimestamps(value)
  )
}

const idsAreUnique = (items: { id: string }[]): boolean =>
  new Set(items.map(({ id }) => id)).size === items.length

const safeIntegerLimit = BigInt(Number.MAX_SAFE_INTEGER)

const totalIsSafe = <T>(items: T[], amount: (item: T) => bigint): boolean => {
  let total = 0n
  for (const item of items) {
    total += amount(item)
    if (total > safeIntegerLimit) return false
  }
  return true
}

const recurringAnnualMultiplier: Record<RecurringFrequency, bigint> = {
  weekly: 52n,
  monthly: 12n,
  quarterly: 4n,
  yearly: 1n,
}

export function validateFinanceData(value: unknown): FinanceData {
  if (!isRecord(value) || !hasOnlyKeys(value, ['transactions', 'accounts', 'recurringPayments'])) {
    throw new Error('Invalid finance data: expected an object')
  }

  const { transactions, accounts, recurringPayments } = value
  if (
    !Array.isArray(transactions) ||
    !transactions.every(isTransaction) ||
    !Array.isArray(accounts) ||
    !accounts.every(isAccount) ||
    !Array.isArray(recurringPayments) ||
    !recurringPayments.every(isRecurringPayment)
  ) {
    throw new Error('Invalid finance data: malformed record')
  }

  if (
    !idsAreUnique(transactions) ||
    !idsAreUnique(accounts) ||
    !idsAreUnique(recurringPayments)
  ) {
    throw new Error('Invalid finance data: duplicate id')
  }

  if (
    !totalIsSafe(transactions, (item) => BigInt(item.amountCents)) ||
    !totalIsSafe(accounts, (item) => BigInt(item.balanceCents)) ||
    !totalIsSafe(
      recurringPayments,
      (item) => BigInt(item.amountCents) * recurringAnnualMultiplier[item.frequency],
    )
  ) {
    throw new Error('Invalid finance data: aggregate amount exceeds safe cents')
  }

  return { transactions, accounts, recurringPayments }
}
