import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FinanceData, RecurringPayment } from '../../types/finance'
import { Recurring } from './Records'
import { Overview } from './Overview'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 12))
})
afterEach(() => { cleanup(); vi.useRealTimers() })
const payment = (id: string, extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id, name: id, category: 'housing', amountCents: 10000, frequency: 'monthly',
  nextDueDate: '2026-10-01', accountId: '', autoPay: false, active: true,
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z', ...extra,
})
const data: FinanceData = { transactions: [], accounts: [], recurringPayments: [
  payment('ongoing'), payment('ended', { endDate: '2026-11-01' }),
  payment('paused', { active: false }),
] }

it('shows the monthly day and computed upcoming date while retaining ended plans outside the budget', () => {
  render(<Recurring data={data} onEdit={() => {}} onDelete={() => {}} />)
  const current = screen.getByText('ongoing').closest('article')!
  expect(within(current).getByText(/每月 1 号/)).toBeInTheDocument()
  expect(within(current).getByText('2026-12-01')).toBeInTheDocument()
  const ended = screen.getByText('ended').closest('article')!
  expect(within(ended).getByText('已结束')).toBeInTheDocument()
  expect(screen.getByText('1 项启用')).toBeInTheDocument()
  expect(screen.getAllByText('$100.00')).toHaveLength(4)
})

it('excludes ended and paused plans from the overview and uses the computed date', () => {
  render(<Overview data={data} month="2026-11" onTransactions={() => {}} onRecurring={() => {}} />)
  expect(screen.getByText('ongoing')).toBeInTheDocument()
  expect(screen.queryByText('ended')).not.toBeInTheDocument()
  expect(screen.queryByText('paused')).not.toBeInTheDocument()
  expect(screen.getByText('12月')).toBeInTheDocument()
  expect(screen.getAllByText('$100.00')).toHaveLength(2)
})
