import type { FinanceData, Transaction } from '../types/finance'

const monthDate = (monthOffset: number, day: number): string => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + monthOffset)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

export function getDemoData(): FinanceData {
  const timestamp = new Date().toISOString()
  const transactions: Transaction[] = []

  for (let monthOffset = -5; monthOffset <= 0; monthOffset += 1) {
    const monthKey = monthDate(monthOffset, 1).slice(0, 7)
    const create = (
      suffix: string,
      day: number,
      fields: Pick<Transaction, 'merchant' | 'amountCents' | 'type' | 'category' | 'accountId'>,
    ): Transaction => ({
      id: `demo-${monthKey}-${suffix}`,
      date: monthDate(monthOffset, day),
      note: '演示数据',
      source: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...fields,
    })

    transactions.push(
      create('salary', 1, {
        merchant: '示例工资',
        amountCents: 620_000,
        type: 'income',
        category: 'income',
        accountId: 'demo-checking',
      }),
      create('rent', 3, {
        merchant: '示例公寓',
        amountCents: 185_000,
        type: 'expense',
        category: 'housing',
        accountId: 'demo-checking',
      }),
      create('groceries', 12, {
        merchant: '示例生鲜市场',
        amountCents: 32_500 + (monthOffset + 5) * 1_250,
        type: 'expense',
        category: 'groceries',
        accountId: 'demo-credit',
      }),
      create('utilities', 18, {
        merchant: '示例公用事业',
        amountCents: 14_800,
        type: 'expense',
        category: 'utilities',
        accountId: 'demo-checking',
      }),
    )
  }

  transactions.push(
    {
      id: 'demo-current-refund',
      date: monthDate(0, 20),
      merchant: '示例商店退款',
      amountCents: 4_500,
      type: 'refund',
      category: 'shopping',
      accountId: 'demo-credit',
      note: '演示数据：退款计入收入',
      source: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'demo-current-transfer',
      date: monthDate(0, 22),
      merchant: '示例信用卡还款',
      amountCents: 80_000,
      type: 'transfer',
      category: 'other',
      accountId: 'demo-checking',
      note: '演示数据：转账不计入收支',
      source: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  )

  return {
    transactions,
    accounts: [
      {
        id: 'demo-checking',
        name: '演示支票账户',
        type: 'checking',
        balanceCents: 845_000,
        currency: 'USD',
        updatedAt: timestamp,
      },
      {
        id: 'demo-savings',
        name: '演示储蓄账户',
        type: 'savings',
        balanceCents: 1_280_000,
        currency: 'USD',
        updatedAt: timestamp,
      },
      {
        id: 'demo-investment',
        name: '演示投资账户',
        type: 'investment',
        balanceCents: 2_450_000,
        currency: 'USD',
        updatedAt: timestamp,
      },
      {
        id: 'demo-credit',
        name: '演示信用卡',
        type: 'credit',
        balanceCents: 126_500,
        currency: 'USD',
        updatedAt: timestamp,
      },
      {
        id: 'demo-loan',
        name: '演示车贷',
        type: 'loan',
        balanceCents: 1_120_000,
        currency: 'USD',
        updatedAt: timestamp,
      },
    ],
    recurringPayments: [
      {
        id: 'demo-recurring-rent',
        name: '示例房租',
        category: 'housing',
        amountCents: 185_000,
        frequency: 'monthly',
        nextDueDate: monthDate(0, 3),
        accountId: 'demo-checking',
        autoPay: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'demo-recurring-insurance',
        name: '示例汽车保险',
        category: 'transportation',
        amountCents: 72_000,
        frequency: 'quarterly',
        nextDueDate: monthDate(0, 12),
        accountId: 'demo-checking',
        autoPay: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'demo-recurring-streaming',
        name: '示例视频订阅',
        category: 'entertainment',
        amountCents: 1_599,
        frequency: 'monthly',
        nextDueDate: monthDate(0, 18),
        accountId: 'demo-credit',
        autoPay: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}
