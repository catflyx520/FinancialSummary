export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer'
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'retirement' | 'loan' | 'other'
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** All monetary values are integer USD cents. Dates are local YYYY-MM-DD. */
export interface Transaction {
  id: string
  date: string
  merchant: string
  amountCents: number
  type: TransactionType
  category: string
  accountId: string
  note: string
  source: 'manual' | 'csv' | 'recurring' | 'pdf'
  createdAt: string
  updatedAt: string
}
export interface Account {
  id: string
  name: string
  type: AccountType
  /** Positive amounts on credit/loan accounts represent debt. */
  balanceCents: number
  currency: 'USD'
  updatedAt: string
}
export interface RecurringPayment {
  id: string
  name: string
  category: string
  amountCents: number
  frequency: RecurringFrequency
  /** Recurrence anchor (first payment); retained field name for existing records. */
  nextDueDate: string
  endDate?: string
  type?: 'income' | 'expense'
  autoPost?: boolean
  lastPostedDate?: string
  accountId: string
  autoPay: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}
export interface FinanceData {
  transactions: Transaction[]
  accounts: Account[]
  recurringPayments: RecurringPayment[]
}
export const emptyFinanceData = (): FinanceData => ({ transactions: [], accounts: [], recurringPayments: [] })
