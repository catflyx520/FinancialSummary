import { describe, expect, it } from 'vitest'
import type {
  Account,
  FinanceData,
  RecurringPayment,
  Transaction,
} from '../types/finance'
import { getDemoData } from './demo'
import {
  categories,
  formatMoney,
  localDate,
  monthlyRecurringCents,
  nextRecurringDate,
  dueIncomeDates,
  dueRecurringDates,
  upcomingRecurringDate,
  parseMoney,
  summarizeAccounts,
  summarizeMonth,
  transactionsCsv,
  validateFinanceData,
} from './finance'

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction-1',
  date: '2026-09-16',
  merchant: 'Neighborhood Market',
  amountCents: 1_250,
  type: 'expense',
  category: 'groceries',
  accountId: '',
  note: '',
  source: 'manual',
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
  ...overrides,
})

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  name: 'Checking',
  type: 'checking',
  balanceCents: 25_000,
  currency: 'USD',
  updatedAt: '2026-09-16T12:00:00.000Z',
  ...overrides,
})

const recurring = (
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id: 'recurring-1',
  name: 'Rent',
  category: 'housing',
  amountCents: 150_000,
  frequency: 'monthly',
  nextDueDate: '2026-09-20',
  accountId: '',
  autoPay: true,
  active: true,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
  ...overrides,
})

const validData = (): FinanceData => ({
  transactions: [transaction()],
  accounts: [account()],
  recurringPayments: [recurring()],
})

describe('money', () => {
  it('parses decimal dollar strings into exact integer cents', () => {
    expect(parseMoney('0')).toBe(0)
    expect(parseMoney(' 12.3 ')).toBe(1_230)
    expect(parseMoney('-0.01')).toBe(-1)
    expect(parseMoney('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each(['', ' ', '1.', '.50', '1.234', '1,000', '1e3', 'NaN']) (
    'rejects invalid money input %j',
    (value) => {
      expect(() => parseMoney(value)).toThrow(/amount/i)
    },
  )

  it('rejects amounts beyond safe integer cents', () => {
    expect(() => parseMoney('90071992547409.92')).toThrow(/amount/i)
  })

  it('formats integer cents as USD and rejects non-integer cents', () => {
    expect(formatMoney(123_456)).toBe('$1,234.56')
    expect(formatMoney(-100)).toBe('-$1.00')
    expect(() => formatMoney(10.5)).toThrow(/cents/i)
  })

  it('returns today as a local calendar date', () => {
    const now = new Date()
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')

    expect(localDate()).toBe(expected)
  })
})

describe('category options', () => {
  it('includes common fixed-cost categories', () => {
    expect(categories.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['car_payment', 'insurance', 'subscription']),
    )
  })
})

describe('monthly summaries', () => {
  it('filters by the transaction calendar month and counts every record', () => {
    const result = summarizeMonth(
      [
        transaction({ id: 'income', date: '2026-09-01', type: 'income', amountCents: 500_000 }),
        transaction({ id: 'expense', date: '2026-09-30', amountCents: 125_000, category: 'housing' }),
        transaction({ id: 'previous', date: '2026-08-31', amountCents: 99_000 }),
        transaction({ id: 'next', date: '2026-10-01', amountCents: 99_000 }),
      ],
      '2026-09',
    )

    expect(result).toEqual({
      incomeCents: 500_000,
      expenseCents: 125_000,
      netCents: 375_000,
      transactionCount: 2,
      categories: [{ category: 'housing', amountCents: 125_000 }],
    })
  })

  it('counts refunds as income, ignores transfers, and leaves purchase categories intact', () => {
    const result = summarizeMonth(
      [
        transaction({ id: 'food', category: 'food', amountCents: 5_000 }),
        transaction({ id: 'food-refund', category: 'food', type: 'refund', amountCents: 5_000 }),
        transaction({ id: 'travel-refund', category: 'travel', type: 'refund', amountCents: 2_000 }),
        transaction({ id: 'transfer', category: 'transfer', type: 'transfer', amountCents: 100_000 }),
      ],
      '2026-09',
    )

    expect(result.incomeCents).toBe(7_000)
    expect(result.expenseCents).toBe(5_000)
    expect(result.netCents).toBe(2_000)
    expect(result.transactionCount).toBe(4)
    expect(result.categories).toEqual([
      { category: 'food', amountCents: 5_000 },
    ])
  })
})

describe('account and recurring summaries', () => {
  it('treats credit and loan balances as liabilities', () => {
    expect(
      summarizeAccounts([
        account({ id: 'cash', type: 'checking', balanceCents: 200_000 }),
        account({ id: 'brokerage', type: 'investment', balanceCents: 300_000 }),
        account({ id: 'card', type: 'credit', balanceCents: 45_000 }),
        account({ id: 'loan', type: 'loan', balanceCents: 155_000 }),
      ]),
    ).toEqual({
      assetsCents: 500_000,
      liabilitiesCents: 200_000,
      netWorthCents: 300_000,
    })
  })

  it('rounds the combined monthly equivalent once and excludes inactive schedules', () => {
    expect(
      monthlyRecurringCents([
        recurring({ id: 'weekly', amountCents: 1, frequency: 'weekly' }),
        recurring({ id: 'quarterly', amountCents: 1, frequency: 'quarterly' }),
        recurring({ id: 'yearly', amountCents: 1, frequency: 'yearly' }),
        recurring({ id: 'inactive', amountCents: 99_999, active: false }),
      ]),
    ).toBe(5)
  })
})

describe('CSV export', () => {
  it('keeps dates and dollar precision, escapes CSV, and neutralizes spreadsheet formulas', () => {
    const csv = transactionsCsv([
      transaction({
        date: '2026-09-03',
        merchant: '=IMPORTXML("bad")',
        amountCents: 12_345,
        category: 'food, dining',
        note: 'line one\nline two',
      }),
    ])

    expect(csv).toContain('2026-09-03')
    expect(csv).toContain('123.45')
    expect(csv).toContain('"\'=IMPORTXML(""bad"")"')
    expect(csv).toContain('"food, dining"')
    expect(csv).toContain('"line one\nline two"')
  })
})

describe('persisted data validation', () => {
  it('accepts complete data and permits an unspecified account', () => {
    const data = validData()
    data.transactions[0]!.accountId = ''
    data.recurringPayments[0]!.accountId = ''

    expect(validateFinanceData(data)).toEqual(data)
  })

  it.each([
    ['missing arrays', { transactions: [], accounts: [] }],
    ['invalid calendar date', { ...validData(), transactions: [transaction({ date: '2026-02-29' })] }],
    ['blank id', { ...validData(), transactions: [transaction({ id: '  ' })] }],
    ['whitespace-padded id', { ...validData(), transactions: [transaction({ id: ' transaction-1 ' })] }],
    ['blank merchant', { ...validData(), transactions: [transaction({ merchant: '' })] }],
    ['decimal cents', { ...validData(), transactions: [transaction({ amountCents: 10.5 })] }],
    ['zero transaction amount', { ...validData(), transactions: [transaction({ amountCents: 0 })] }],
    ['invalid transaction type', { ...validData(), transactions: [transaction({ type: 'purchase' as Transaction['type'] })] }],
    ['invalid transaction source', { ...validData(), transactions: [transaction({ source: 'unknown' as Transaction['source'] })] }],
    ['negative account balance', { ...validData(), accounts: [account({ balanceCents: -1 })] }],
    ['wrong currency', { ...validData(), accounts: [account({ currency: 'EUR' as Account['currency'] })] }],
    ['blank recurring name', { ...validData(), recurringPayments: [recurring({ name: ' ' })] }],
    ['invalid due date', { ...validData(), recurringPayments: [recurring({ nextDueDate: '2026-13-01' })] }],
    ['invalid timestamp', { ...validData(), accounts: [account({ updatedAt: 'yesterday' })] }],
    ['impossible timestamp date', { ...validData(), accounts: [account({ updatedAt: '2026-02-30T12:00:00.000Z' })] }],
    ['duplicate ids', { ...validData(), transactions: [transaction(), transaction()] }],
    ['id containing a slash', { ...validData(), transactions: [transaction({ id: 'folder/transaction' })] }],
    ['id longer than 128 characters', { ...validData(), accounts: [account({ id: 'a'.repeat(129) })] }],
    ['account id containing a slash', { ...validData(), transactions: [transaction({ accountId: 'folder/account' })] }],
    ['merchant longer than 120 characters', { ...validData(), transactions: [transaction({ merchant: 'm'.repeat(121) })] }],
    ['account name longer than 120 characters', { ...validData(), accounts: [account({ name: 'a'.repeat(121) })] }],
    ['recurring name longer than 120 characters', { ...validData(), recurringPayments: [recurring({ name: 'r'.repeat(121) })] }],
    ['category longer than 80 characters', { ...validData(), transactions: [transaction({ category: 'c'.repeat(81) })] }],
    ['note longer than 500 characters', { ...validData(), transactions: [transaction({ note: 'n'.repeat(501) })] }],
    ['noncanonical timestamp', { ...validData(), accounts: [account({ updatedAt: '2026-09-16T12:00:00Z' })] }],
    ['timestamp with offset', { ...validData(), accounts: [account({ updatedAt: '2026-09-16T12:00:00.000+01:00' })] }],
    ['unknown transaction key', { ...validData(), transactions: [{ ...transaction(), unexpected: true }] }],
    ['unknown account key', { ...validData(), accounts: [{ ...account(), unexpected: true }] }],
    ['unknown recurring key', { ...validData(), recurringPayments: [{ ...recurring(), unexpected: true }] }],
    ['transaction above the single-record cap', { ...validData(), transactions: [transaction({ amountCents: 100_000_000_001 })] }],
    ['account above the single-record cap', { ...validData(), accounts: [account({ balanceCents: 100_000_000_001 })] }],
    ['recurring payment above the single-record cap', { ...validData(), recurringPayments: [recurring({ amountCents: 100_000_000_001 })] }],
  ])('rejects %s', (_label, data) => {
    expect(() => validateFinanceData(data)).toThrow(/invalid finance data/i)
  })

  it('rejects two individually safe incomes before their summary can overflow', () => {
    const data = validData()
    data.transactions = [
      transaction({ id: 'income-1', type: 'income', amountCents: Number.MAX_SAFE_INTEGER }),
      transaction({ id: 'income-2', type: 'income', amountCents: Number.MAX_SAFE_INTEGER }),
    ]

    expect(() => validateFinanceData(data)).toThrow(/invalid finance data/i)
  })

  it('rejects aggregate transaction cents outside the safe integer range', () => {
    const data = validData()
    data.transactions = Array.from({ length: 90_072 }, (_, index) =>
      transaction({ id: `transaction-${index}`, amountCents: 100_000_000_000 }),
    )

    expect(() => validateFinanceData(data)).toThrow(/invalid finance data/i)
  })

  it('rejects annualized recurring cents outside the safe integer range', () => {
    const data = validData()
    data.recurringPayments = Array.from({ length: 1_733 }, (_, index) =>
      recurring({
        id: `recurring-${index}`,
        amountCents: 100_000_000_000,
        frequency: 'weekly',
      }),
    )

    expect(() => validateFinanceData(data)).toThrow(/invalid finance data/i)
  })
})

describe('demo data', () => {
  it('is a fresh illustrative six-month workspace with current-month schedules', () => {
    const first = getDemoData()
    const second = getDemoData()
    const currentMonth = localDate().slice(0, 7)
    const transactionMonths = new Set(first.transactions.map(({ date }) => date.slice(0, 7)))

    expect(first.accounts.length).toBeGreaterThan(0)
    expect(transactionMonths).toHaveLength(6)
    expect(first.recurringPayments.length).toBeGreaterThan(0)
    expect(first.recurringPayments.every(({ nextDueDate }) => nextDueDate.startsWith(currentMonth))).toBe(true)
    expect(validateFinanceData(first)).toEqual(first)
    expect(first).not.toBe(second)
    expect(first.transactions).not.toBe(second.transactions)
  })
})


describe('recurring payment calendar', () => {
  it.each([
    ['2026-10-01', 'monthly', '2026-09-28', '2026-10-01'],
    ['2026-10-01', 'monthly', '2026-10-01', '2026-10-01'],
    ['2026-10-01', 'monthly', '2026-10-02', '2026-11-01'],
    ['2026-10-01', 'monthly', '2026-12-31', '2027-01-01'],
    ['2026-01-31', 'monthly', '2026-02-01', '2026-02-28'],
    ['2026-01-31', 'monthly', '2026-03-01', '2026-03-31'],
    ['2024-02-29', 'yearly', '2025-02-01', '2025-02-28'],
    ['2024-02-29', 'yearly', '2028-02-01', '2028-02-29'],
    ['2026-01-31', 'quarterly', '2026-02-01', '2026-04-30'],
    ['2026-09-28', 'weekly', '2026-09-29', '2026-10-05'],
  ] as const)('advances %s %s as of %s to %s', (anchor, frequency, today, expected) => {
    expect(nextRecurringDate(recurring({ nextDueDate: anchor, frequency }), today)).toBe(expected)
  })

  it('includes the final date but never schedules past it or while paused', () => {
    const payment = recurring({ nextDueDate: '2026-10-01', endDate: '2026-11-01' })
    expect(nextRecurringDate(payment, '2026-11-01')).toBe('2026-11-01')
    expect(nextRecurringDate(payment, '2026-11-02')).toBeNull()
    expect(nextRecurringDate({ ...payment, endDate: '2026-10-15' }, '2026-10-02')).toBeNull()
    expect(nextRecurringDate({ ...payment, active: false }, '2026-10-01')).toBeNull()
    expect(monthlyRecurringCents([payment], '2026-11-01')).toBe(150000)
    expect(monthlyRecurringCents([payment], '2026-11-02')).toBe(0)
  })

  it('accepts optional end dates and legacy records but rejects invalid ranges', () => {
    for (const endDate of [undefined, '', '2026-09-20', '2027-01-01']) {
      const payment = recurring(endDate === undefined ? {} : { endDate })
      expect(validateFinanceData({ ...validData(), recurringPayments: [payment] }).recurringPayments).toEqual([payment])
    }
    for (const endDate of ['2026-09-19', '2026-02-30', 'bad', null]) {
      expect(() => validateFinanceData({ ...validData(), recurringPayments: [{ ...recurring(), endDate }] })).toThrow()
    }
  })
})

describe('scheduled income posting', () => {
  it('posts enabled expenses at the month end through the inclusive end date', () => {
    const plan = recurring({ type: 'expense', autoPost: true, accountId: 'checking',
      nextDueDate: '2026-01-31', endDate: '2026-03-31' })
    expect(dueRecurringDates(plan, '2026-04-01')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(dueRecurringDates({ ...plan, lastPostedDate: '2026-03-31' }, '2026-04-01')).toEqual([])
    expect(dueRecurringDates({ ...plan, active: false }, '2026-04-01')).toEqual([])
    expect(upcomingRecurringDate({ ...plan, endDate: '', lastPostedDate: '2026-03-31' }, '2026-03-31')).toBe('2026-04-30')
    expect(validateFinanceData({ ...validData(), recurringPayments: [plan] }).recurringPayments).toEqual([plan])
  })
  it('lists due dates through today, including a short-month payment, only once per period', () => {
    const plan = recurring({
      id: 'salary', type: 'income', autoPost: true,
      nextDueDate: '2026-01-31', endDate: '2026-04-30',
    })
    expect(dueIncomeDates(plan, '2026-03-05')).toEqual([
      '2026-01-31', '2026-02-28',
    ])
    expect(dueIncomeDates({ ...plan, lastPostedDate: '2026-02-28' }, '2026-03-05')).toEqual([])
    expect(dueIncomeDates({ ...plan, lastPostedDate: '2026-02-28' }, '2026-03-31')).toEqual(['2026-03-31'])
  })

  it('shows the next unposted income date after an automatic salary is recorded', () => {
    const plan = recurring({ type: 'income', autoPost: true, nextDueDate: '2026-09-29', lastPostedDate: '2026-09-29' })
    expect(upcomingRecurringDate(plan, '2026-09-29')).toBe('2026-10-29')
  })

  it('does not post expense, paused, or explicitly disabled plans', () => {
    const base = recurring({ nextDueDate: '2026-09-01', autoPost: true })
    expect(dueIncomeDates(base, '2026-09-30')).toEqual([])
    expect(dueIncomeDates({ ...base, type: 'income', active: false }, '2026-09-30')).toEqual([])
    expect(dueIncomeDates({ ...base, type: 'income', autoPost: false }, '2026-09-30')).toEqual([])
  })

  it('accepts new fields while preserving existing expense records', () => {
    const data = validData()
    expect(validateFinanceData(data)).toEqual(data)
    const plan = recurring({ type: 'income', autoPost: true, lastPostedDate: '2026-09-20' })
    expect(validateFinanceData({ ...data, recurringPayments: [plan] }).recurringPayments).toEqual([plan])
    expect(() => validateFinanceData({ ...data, recurringPayments: [recurring({ type: 'expense', autoPost: true, accountId: '' })] })).toThrow()
  })
})
